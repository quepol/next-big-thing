"""One-off study: how did the user's aughts favourites climb the venue ladder?

For five bands the user watched rise in SF (Café du Nord → Independent → Regency →
Warfield), pull every setlist.fm show in the Bay Area and Toronto, with room sizes, so
the venue page can chart each climb and how long each step took.

Writes site/data/ladder_study.json. Run by .github/workflows/ladder-study.yml. Uses
per-city setlist searches (a few dozen calls) and stops without writing if setlist.fm's
daily limit cuts it short; re-run to resume from the cache.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "research" / "ladder_cache.json"
OUT = ROOT / "site" / "data" / "ladder_study.json"
BASE = "https://api.setlist.fm/rest/1.0"
KEY = os.environ["SETLISTFM_API_KEY"]

BANDS = ["The National", "Arcade Fire", "The Decemberists", "Bon Iver", "Guster"]
CITIES = [("San Francisco", "US"), ("Oakland", "US"), ("Berkeley", "US"), ("Toronto", "CA")]

# Room sizes (approximate, public sources). Lowercased setlist.fm venue names.
# Labels mark spaces with no single capacity; they sit above the club/theatre ladder.
BAY_CAPACITY = {
    "café du nord": 300, "cafe du nord": 300, "bottom of the hill": 275, "the independent": 500,
    "great american music hall": 600, "bimbo's 365 club": 685, "slim's": 500,
    "the fillmore": 1250, "the regency ballroom": 1400, "the warfield": 2300,
    "fox theater": 2800, "paramount theatre": 3000, "the masonic": 3300,
    "louise m. davies symphony hall": 2743, "william randolph hearst greek theatre": 8500,
    "bill graham civic auditorium": 8500, "oracle arena": 19000, "chase center": 18000,
    "shoreline amphitheatre": 22000, "golden gate park": "Festival",
    "treasure island": "Festival", "zellerbach hall": 2000, "the chapel": 400,
    "rickshaw stop": 400, "amoeba music": "In-store", "the great american music hall": 600,
}
# Older Toronto rooms on top of site/data/toronto_capacity.json.
TORONTO_EXTRA = {
    "kool haus": 2500, "sound academy": 3000, "molson canadian amphitheatre": 16000,
    "molson amphitheatre": 16000, "air canada centre": 19800, "echo beach": 5000,
    "el mocambo": 300, "the mod club theatre": 575, "toronto island park": "Festival",
    "the guvernment": 2500, "ricoh coliseum": 8000,
}

_cache: dict = json.loads(CACHE.read_text()) if CACHE.exists() else {}


class OutOfBudget(Exception):
    pass


def get(path: str, **params) -> dict:
    key = path + json.dumps(params, sort_keys=True)
    if key in _cache:
        return _cache[key]
    for attempt in range(4):
        time.sleep(0.6)
        r = requests.get(f"{BASE}{path}", params=params, timeout=20,
                         headers={"x-api-key": KEY, "Accept": "application/json"})
        if r.status_code == 404:
            data = {}
            break
        if r.status_code == 429:
            time.sleep(10 * (attempt + 1))
            continue
        r.raise_for_status()
        data = r.json()
        break
    else:
        raise OutOfBudget
    _cache[key] = data
    return data


def artist_mbid(name: str) -> str | None:
    data = get("/search/artists", artistName=name, sort="relevance")
    for a in data.get("artist", []):
        if a.get("name", "").lower() == name.lower():
            return a["mbid"]
    return None


def city_shows(mbid: str, city: str, country: str) -> list[dict]:
    out, page = [], 1
    while True:
        data = get("/search/setlists", artistMbid=mbid, cityName=city, countryCode=country, p=page)
        out += data.get("setlist", [])
        if page * data.get("itemsPerPage", 20) >= data.get("total", 0):
            return out
        page += 1


def main() -> None:
    tor = json.loads((ROOT / "site" / "data" / "toronto_capacity.json").read_text())
    tor.update(TORONTO_EXTRA)
    bands = []
    try:
        for name in BANDS:
            mbid = artist_mbid(name)
            shows = []
            for city, country in CITIES if mbid else []:
                for s in city_shows(mbid, city, country):
                    v = s["venue"]["name"]
                    caps = tor if country == "CA" else BAY_CAPACITY
                    d = datetime.strptime(s["eventDate"], "%d-%m-%Y").date().isoformat()
                    shows.append({"date": d, "city": "Toronto" if country == "CA" else "Bay Area",
                                  "venue": v, "cap": caps.get(v.lower())})
            # one entry per city per night (setlist.fm sometimes has duplicates)
            seen, uniq = set(), []
            for sh in sorted(shows, key=lambda x: x["date"]):
                if (sh["date"], sh["city"]) not in seen:
                    seen.add((sh["date"], sh["city"]))
                    uniq.append(sh)
            bands.append({"artist": name, "mbid": mbid, "shows": uniq})
            print(f"{name}: {len(uniq)} shows", flush=True)
    except OutOfBudget:
        CACHE.write_text(json.dumps(_cache))
        print("setlist.fm daily limit reached; results not written. Re-run to resume.")
        return
    CACHE.write_text(json.dumps(_cache))
    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bands": bands,
    }, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
