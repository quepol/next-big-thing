"""One-off research: which Toronto venues book the same bands as SF venues the user trusts?

Pulls setlist.fm history for the trusted SF rooms and for all of Toronto over the same
window, then ranks Toronto venues by how many SF-room artists they hosted, against a
baseline (the share of all Toronto artists who also played the SF rooms). Writes
site/data/venue_research.json for site/venues.html.

Not part of the daily pipeline. Run by .github/workflows/venue-research.yml.
"""

from __future__ import annotations

import json
import os
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from nbt.models import normalize_name  # noqa: E402

BASE = "https://api.setlist.fm/rest/1.0"
KEY = os.environ["SETLISTFM_API_KEY"]
CACHE = ROOT / "research" / "cache.json"
OUT = ROOT / "site" / "data" / "venue_research.json"
SINCE = date(2023, 10, 1)
MAX_REQUESTS = int(os.environ.get("MAX_REQUESTS", "1300"))  # setlist.fm allows ~1,440/day

# The user's trusted rooms. Capacities are from public sources and vary by layout.
SF_VENUES = [
    {"name": "The Independent", "match": "independent", "capacity": "500"},
    {"name": "Café du Nord", "match": "du nord", "capacity": "~300–320"},
    {"name": "Bottom of the Hill", "match": "bottom of the hill", "capacity": "~250–275"},
    {"name": "Great American Music Hall", "match": "great american music hall", "capacity": "~600"},
    {"name": "Bimbo's 365 Club", "match": "bimbo", "capacity": "~685"},
    {"name": "The Regency Ballroom", "match": "regency ballroom", "capacity": "~1,400 standing", "larger": True},
    {"name": "The Fillmore", "match": "fillmore", "capacity": "~1,150–1,315", "larger": True},
]

_cache: dict = json.loads(CACHE.read_text()) if CACHE.exists() else {}
_requests = 0


class OutOfBudget(Exception):
    pass


def get(path: str, **params) -> dict:
    global _requests
    key = path + json.dumps(params, sort_keys=True)
    if key in _cache:
        return _cache[key]
    if _requests >= MAX_REQUESTS:
        raise OutOfBudget
    for attempt in range(4):
        _requests += 1
        time.sleep(0.6)  # stay under 2 requests/second
        r = requests.get(f"{BASE}{path}", params=params, timeout=20,
                         headers={"x-api-key": KEY, "Accept": "application/json"})
        if r.status_code == 404:  # setlist.fm's "no results"
            data = {}
            break
        if r.status_code == 429:
            time.sleep(10 * (attempt + 1))
            continue
        r.raise_for_status()
        data = r.json()
        break
    else:
        raise OutOfBudget  # rate-limited for good: save progress and stop
    _cache[key] = data
    return data


def save_cache() -> None:
    CACHE.write_text(json.dumps(_cache))


def event_date(s: dict) -> date:
    return datetime.strptime(s["eventDate"], "%d-%m-%Y").date()


def artist_key(s: dict) -> str:
    a = s.get("artist", {})
    return normalize_name(a.get("name", "")) or a.get("mbid", "")


def find_sf_venue(v: dict) -> list[dict]:
    """setlist.fm can hold several entries for one room; keep every SF match."""
    data = get("/search/venues", name=v["name"], cityName="San Francisco", countryCode="US")
    hits = [x for x in data.get("venue", []) if v["match"] in x.get("name", "").lower()]
    if v["match"] == "independent":  # don't pick up "Independent Records" and the like
        hits = [x for x in hits if x["name"].lower() in ("the independent", "independent")]
    return hits


def venue_setlists(venue_id: str) -> tuple[list[dict], bool]:
    """Setlists at a venue since SINCE (newest first). Returns (setlists, complete)."""
    out, page = [], 1
    while True:
        try:
            data = get(f"/venue/{venue_id}/setlists", p=page)
        except OutOfBudget:
            return out, False
        batch = data.get("setlist", [])
        if not batch:
            return out, True
        for s in batch:
            if event_date(s) < SINCE:
                return out, True
            out.append(s)
        if page * data.get("itemsPerPage", 20) >= data.get("total", 0):
            return out, True
        page += 1


def toronto_setlists() -> tuple[list[dict], dict]:
    """All Toronto setlists since SINCE, one year at a time."""
    out, coverage = [], {}
    for year in range(SINCE.year, date.today().year + 1):
        page, total, fetched = 1, None, 0
        while True:
            try:
                data = get("/search/setlists", cityName="Toronto", countryCode="CA", year=year, p=page)
            except OutOfBudget:
                break
            batch = data.get("setlist", [])
            total = data.get("total", 0)
            fetched += len(batch)
            out.extend(s for s in batch if event_date(s) >= SINCE)
            if not batch or page * data.get("itemsPerPage", 20) >= total:
                break
            page += 1
        coverage[year] = {"fetched": fetched, "total": total}
    return out, coverage


def toronto_capacity() -> dict:
    path = ROOT / "site" / "data" / "toronto_capacity.json"
    return json.loads(path.read_text()) if path.exists() else {}


def repeat_visitors(shared: set, sf_artists: dict, tor_dates: dict) -> list[dict]:
    """Shared artists who came back to Toronto (2+ visits, 30+ days apart): momentum.

    Adds Last.fm listeners (so the page can keep to small artists) and whether a later
    Toronto show was in a clearly bigger room than the first, i.e. they're moving up.
    """
    caps = toronto_capacity()
    num = lambda c: c if isinstance(c, int) else None  # labels like "Festival" don't count
    lastfm = None
    if os.environ.get("LASTFM_API_KEY"):
        from nbt.lastfm import LastFM
        lastfm = LastFM()
    out = []
    for k in shared:
        dates = sorted(tor_dates.get(k, {}).items())
        # Back-to-back nights on one tour are one visit: count visits 30+ days apart.
        visits, last = 0, None
        for d, _ in dates:
            day = date.fromisoformat(d)
            if last is None or (day - last).days >= 30:
                visits += 1
            last = day
        if visits < 2:
            continue
        shows = [{"date": d, "venue": v, "cap": num(caps.get(v.lower()))} for d, v in dates]
        first = shows[0]["cap"]
        later = [s["cap"] for s in shows[1:] if s["cap"]]
        info = lastfm.artist_info(sf_artists[k]["name"]) if lastfm else None
        out.append({
            "artist": sf_artists[k]["name"],
            "listeners": info["listeners"] if info else None,
            "sf": sorted(sf_artists[k]["venues"]),
            "visits": visits,
            "shows": shows,
            "stepped_up": bool(first and later and max(later) >= first * 1.25),
        })
    if lastfm:
        lastfm.save()
    out.sort(key=lambda a: (-a["stepped_up"], -a["visits"], a["artist"].lower()))
    return out


def main() -> None:
    complete = True
    sf_artists: dict[str, dict] = {}  # key -> {name, venues: set}
    sf_report = []
    try:
        for v in SF_VENUES:
            hits = find_sf_venue(v)
            shows, ok = [], True
            for h in hits:
                s, done = venue_setlists(h["id"])
                shows += s
                ok = ok and done
            complete = complete and ok
            names = set()
            for s in shows:
                k = artist_key(s)
                if not k:
                    continue
                names.add(k)
                entry = sf_artists.setdefault(k, {"name": s["artist"]["name"], "venues": set()})
                entry["venues"].add(v["name"])
            sf_report.append({
                "name": v["name"], "capacity": v["capacity"], "larger": v.get("larger", False),
                "setlistfm": [h["name"] for h in hits], "shows": len(shows), "artists": len(names),
                "complete": ok,
            })
            print(f"{v['name']}: {len(hits)} setlist.fm venue(s), {len(shows)} shows, {len(names)} artists", flush=True)
            save_cache()

        tor, coverage = toronto_setlists()
    finally:
        save_cache()
    print(f"Toronto: {len(tor)} setlists; coverage {coverage}; requests this run {_requests}", flush=True)
    for y in coverage.values():
        if y["total"] and y["fetched"] < y["total"]:
            complete = False

    # Toronto venues -> artists
    venues: dict[str, dict] = {}
    tor_dates: dict[str, dict[str, str]] = defaultdict(dict)  # artist -> {iso date: venue}
    for s in tor:
        k = artist_key(s)
        if not k:
            continue
        v = s["venue"]
        tor_dates[k].setdefault(event_date(s).isoformat(), v["name"])
        entry = venues.setdefault(v["id"], {"name": v["name"], "artists": {}, "shows": 0})
        entry["shows"] += 1
        entry["artists"].setdefault(k, s["artist"]["name"])

    all_tor = {k for v in venues.values() for k in v["artists"]}
    sf_keys = set(sf_artists)
    shared = sf_keys & all_tor
    baseline = len(shared) / len(all_tor) if all_tor else 0

    ranked = []
    for vid, v in venues.items():
        overlap = sorted(set(v["artists"]) & sf_keys)
        n = len(v["artists"])
        share = len(overlap) / n if n else 0
        by_sf = defaultdict(int)
        for k in overlap:
            for name in sf_artists[k]["venues"]:
                by_sf[name] += 1
        ranked.append({
            "id": vid, "name": v["name"], "shows": v["shows"], "artists": n,
            "overlap": len(overlap), "share": round(share, 4),
            "lift": round(share / baseline, 2) if baseline else None,
            "by_sf_venue": dict(by_sf),
            "overlap_artists": [v["artists"][k] for k in overlap],
        })
    ranked.sort(key=lambda r: (-r["overlap"], -r["share"]))

    shared_artists = []
    for k in sorted(shared, key=lambda k: sf_artists[k]["name"].lower()):
        tor_venues = sorted({v["name"] for v in venues.values() if k in v["artists"]})
        shared_artists.append({"artist": sf_artists[k]["name"],
                               "sf": sorted(sf_artists[k]["venues"]), "toronto": tor_venues})

    repeat = repeat_visitors(shared, sf_artists, tor_dates)

    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "since": SINCE.isoformat(),
        "complete": complete,
        "requests": _requests,
        "sf_venues": sf_report,
        "sf_artists": len(sf_keys),
        "toronto": {"setlists": len(tor), "venues": len(venues), "artists": len(all_tor), "coverage": coverage},
        "shared_artists_count": len(shared),
        "baseline": round(baseline, 4),
        "toronto_venues": ranked,
        "shared_artists": shared_artists,
        "repeat_artists": repeat,
    }, indent=1, ensure_ascii=False))
    print(f"SF artists {len(sf_keys)}, Toronto artists {len(all_tor)}, shared {len(shared)}, "
          f"baseline {baseline:.3f}, complete={complete}")


if __name__ == "__main__":
    main()
