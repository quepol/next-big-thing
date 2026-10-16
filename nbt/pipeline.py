"""Daily run: sync history -> gather events -> score -> snapshot -> write digest."""

from __future__ import annotations

from datetime import date, datetime, timezone

from . import history as hist
from . import ledger as led
from . import snapshots
from .config import CONFIG, SITE_DIR
from .lastfm import LastFM
from .models import Event, haversine_km, normalize_name
from .scoring import is_upcoming, score_events
from .sources.bandsintown import Bandsintown
from .store import write_json
from .taste import Taste

DIGEST_PATH = SITE_DIR / "data" / "digest.json"
# Artist-first lookups for unknown artists the taste graph points at most strongly.
NEIGHBOUR_LOOKUPS = 500


def assign_region(ev: Event) -> str | None:
    if ev.venue.lat is None or ev.venue.lon is None:
        return None
    for r in CONFIG.regions:
        if haversine_km(r.lat, r.lon, ev.venue.lat, ev.venue.lon) <= r.radius_km:
            return r.name
    return None


def gather_events(bit: Bandsintown, history: dict, taste: Taste, today: date, log=print) -> list[Event]:
    events: dict[str, Event] = {}

    for region in CONFIG.regions:
        if region.tiers != "all":
            continue
        try:
            for ev in bit.city_events(region):
                events[ev.id] = ev
        except NotImplementedError as e:
            log(f"city feed for {region.name}: {e}")

    if not bit.app_id:
        log("BANDSINTOWN_APP_ID not set: skipping artist-first lookups")
        lookups = []
    else:
        lookups = [row["name"] for row in hist.known(history).values()]
        lookups += taste.top_neighbours(NEIGHBOUR_LOOKUPS)
    log(f"artist-first lookups: {len(lookups)}")
    for i, name in enumerate(lookups):
        for ev in bit.artist_events(name):
            events.setdefault(ev.id, ev)
        if i and i % 250 == 0:
            log(f"  {i}/{len(lookups)}")
            bit.save()
    bit.save()

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
    bit = Bandsintown()

    history = hist.sync(lastfm, log=log)
    loved = hist.loved(history)
    log("building taste graph")
    taste = Taste(history, lastfm, log=log)
    lastfm.save()

    events = gather_events(bit, history, taste, today, log=log)
    snapshots.save_events(today, [e.to_dict() for e in events])

    def info(name: str):
        return lastfm.artist_info(name)

    def velocity(key: str, listeners: int):
        return snapshots.velocity(key, today, listeners)

    picks = score_events(
        events, history, loved,
        affinity=taste.affinity, artist_info=info, velocity=velocity,
        regions={r.name: r.tiers for r in CONFIG.regions},
        is_alias=taste.looks_like_alias,
    )

    ledger = led.load()
    listeners: dict[str, int] = {}
    names = {a for e in events for a in e.lineup} | {row["artist"] for row in ledger.values()}
    for name in names:
        i = lastfm.artist_info(name)
        if i:
            listeners[normalize_name(name)] = i["listeners"]
    lastfm.save()
    snapshots.save_listeners(today, listeners)
    led.save(led.update(ledger, picks, today, listeners))

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
        "ledger": sorted(ledger.values(), key=lambda r: r["first_flagged"], reverse=True),
    }
    write_json(DIGEST_PATH, digest)
    log(f"digest: " + ", ".join(f"{t}={len(v)}" for t, v in digest["picks"].items()))
    return digest
