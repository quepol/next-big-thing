"""Daily run: sync history -> gather events -> score -> snapshot -> write digest."""

from __future__ import annotations

from datetime import date, datetime, timezone

from . import bands, exclusions
from . import history as hist
from . import ledger as led
from . import snapshots
from .config import CONFIG, SITE_DIR
from .lastfm import LastFM
from .models import Event, haversine_km, normalize_name
from .scoring import calendar, is_upcoming, score_events
from .sources.setlistfm import SetlistFM
from .sources.ticketmaster import Ticketmaster
from .store import write_json
from .taste import Taste

DIGEST_PATH = SITE_DIR / "data" / "digest.json"


def assign_region(ev: Event) -> str | None:
    if ev.venue.lat is None or ev.venue.lon is None:
        return None
    for r in CONFIG.regions:
        if haversine_km(r.lat, r.lon, ev.venue.lat, ev.venue.lon) <= r.radius_km:
            return r.name
    return None


def gather_events(tm: Ticketmaster, today: date, log=print) -> list[Event]:
    """Every music event near each region, from Ticketmaster (TicketWeb included).

    Out-of-town regions are fetched too; scoring keeps only the bands you love there.
    (They used to arrive through Bandsintown artist lookups, which have been dead
    since its app ID started getting 401s.)
    """
    events: dict[str, Event] = {}
    for region in CONFIG.regions:
        try:
            for ev in tm.city_events(region):
                events.setdefault(ev.id, ev)
        except Exception as e:
            log(f"city feed for {region.name}: {e}")
    tm.save()

    kept = []
    for ev in events.values():
        ev.region = ev.region or assign_region(ev) or ""
        if ev.region and is_upcoming(ev, today, CONFIG.lookahead_days):
            kept.append(ev)
    log(f"events in range: {len(kept)} (of {len(events)} fetched)")
    return sorted(kept, key=lambda e: e.starts_at)


def run(log=print) -> dict:
    if not CONFIG.lastfm_user:
        raise SystemExit("LASTFM_USER is not set")
    today = date.today()
    lastfm = LastFM()

    history = hist.sync(lastfm, log=log)
    excluded, auto = exclusions.effective(history, lastfm, CONFIG.known_min_days)
    log(f"excluded: {len(excluded)} artists ({len(auto)} automatically by kids' tags)")
    travel = hist.travel_reasons(history, excluded=excluded)

    # setlist.fm: attended artists are worth the trip (can't be polluted by kids' scrobbles)
    # and are injected as taste seeds so their neighbours surface as recommendations.
    slm = SetlistFM()
    attended: dict[str, str] = {}
    attended_seen: dict[str, tuple[int, int]] = {}
    attended_venues: set[str] = set()
    if CONFIG.setlistfm_api_key:
        try:
            attended = slm.attended_artists()
            attended_seen = slm.attended_seen()
            attended_venues = slm.attended_venue_names()
            slm.save()
            log(f"setlist.fm: {len(attended)} attended artists, {len(attended_venues)} venues")
            # Attended artists are worth the trip, regardless of scrobble count.
            for key in attended:
                if key not in excluded:
                    travel.setdefault(key, []).append("live")
        except Exception as e:
            log(f"setlist.fm: {e} (skipping)")
    else:
        log("SETLISTFM_API_KEY not set: skipping setlist.fm")

    loves = exclusions.load_loves()
    log(f"loves: {len(loves)} artists bypass recency decay")
    # A misspelt line ("Haley Williams") matches nothing and silently does nothing.
    unmatched = sorted(n for n in loves if n not in history["artists"])
    if unmatched:
        log(f"::warning::loves.txt names not in your history (check the spelling): {', '.join(unmatched)}")
    log("building taste graph")
    taste = Taste(history, lastfm, log=log, excluded=excluded, attended=attended, loves=loves,
                  attended_seen=attended_seen)
    lastfm.save()

    tm = Ticketmaster()
    events = gather_events(tm, today, log=log)
    snapshots.save_events(today, [e.to_dict() for e in events])

    def info(name: str):
        return lastfm.artist_info(name)

    def velocity(key: str, listeners: int):
        return snapshots.velocity(key, today, listeners)

    picks = score_events(
        events, history, set(travel),
        affinity=taste.affinity, artist_info=info, velocity=velocity,
        regions={r.name: r.tiers for r in CONFIG.regions},
        is_noise=taste.is_noise,
        excluded=excluded,
        attended_venues=attended_venues or None,
    )

    ledger = led.load()
    listeners: dict[str, int] = {}
    names = (
        {a for e in events for a in e.lineup}
        | {row["artist"] for row in ledger.values()}
        | {v for v in attended.values()}  # attended artists for retroactive ledger
    )
    for name in names:
        i = lastfm.artist_info(name)
        if i:
            listeners[normalize_name(name)] = i["listeners"]
    lastfm.save()
    snapshots.save_listeners(today, listeners)
    led.save(led.update(ledger, picks, today, listeners))

    home_regions = {r.name for r in CONFIG.regions if r.tiers == "all"}
    digest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "user": CONFIG.lastfm_user,
        "stats": {
            "events": len(events),
            "known_artists": len(hist.known(history)),
            "snapshot_days": len(list(snapshots.LISTENERS_DIR.glob("*.json"))),
        },
        "picks": {
            tier: [p.to_dict() for p in picks if p.tier == tier]
            for tier in ("next_big_thing", "would_like", "know")
        },
        # Every upcoming show with per-act scores, for the site's room view.
        # Toronto only: out-of-town rooms aren't part of the room view.
        "calendar": calendar([e for e in events if e.region in home_regions], history, taste.affinity, info,
                             excluded=excluded, is_noise=taste.is_noise),
        "ledger": sorted(ledger.values(), key=lambda r: r["first_flagged"], reverse=True),
        # Backstage "Your bands": who's worth the trip, who seeds your taste, and why.
        "bands": bands.table(history, travel, taste.seeds, taste.weights,
                             {k: v["name"] for k, v in taste.known.items()}, excluded, today),
        "attended_ledger": slm.attended_ledger(current_listeners=listeners) if CONFIG.setlistfm_api_key else [],
    }
    write_json(DIGEST_PATH, digest)
    log(f"digest: " + ", ".join(f"{t}={len(v)}" for t, v in digest["picks"].items()))
    return digest
