"""Bandsintown event sources.

Two ways in:
  artist_events() - the documented REST API (one artist at a time). Covers "bands you know"
                    and "bands you'd like", but can never surface an artist we didn't ask about.
  city_events()   - every show in a city, scraped from the website. This is what the
                    next-big-thing tier depends on. NOT IMPLEMENTED until the coverage check:
                    we haven't been able to look at the live page structure yet, and a scraper
                    written blind would be fiction.
"""

from __future__ import annotations

from urllib.parse import quote

import requests

from ..config import CONFIG, Region
from ..models import Event, Venue
from ..store import Cache
from ..config import DATA_DIR

REST = "https://rest.bandsintown.com"


class Bandsintown:
    def __init__(self, app_id: str = CONFIG.bandsintown_app_id, session: requests.Session | None = None):
        self.app_id = app_id
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = "next-big-thing/0.1 (personal show recommender)"
        # Tour dates change, so cache for a day only.
        self.cache = Cache(DATA_DIR / "cache" / "bit_artist_events.json", ttl_days=1)

    def save(self) -> None:
        self.cache.save()

    def artist_events(self, artist: str) -> list[Event]:
        if not self.app_id:
            raise RuntimeError("BANDSINTOWN_APP_ID is not set")
        cached = self.cache.get(artist)
        if cached is None:
            url = f"{REST}/artists/{quote(artist, safe='')}/events"
            try:
                resp = self.session.get(url, params={"app_id": self.app_id, "date": "upcoming"}, timeout=30)
                body = resp.json() if resp.ok else []
            except (requests.RequestException, ValueError):
                return []
            cached = body if isinstance(body, list) else []
            self.cache.set(artist, cached)
        return [parse_rest_event(e) for e in cached if e.get("venue")]

    def city_events(self, region: Region) -> list[Event]:
        raise NotImplementedError("city feed scraper pending coverage check")


def parse_rest_event(e: dict) -> Event:
    v = e["venue"]
    return Event(
        id=f"bit:{e['id']}",
        starts_at=e["datetime"],
        venue=Venue(
            name=v.get("name", ""),
            city=", ".join(x for x in (v.get("city"), v.get("region")) if x),
            lat=_float(v.get("latitude")),
            lon=_float(v.get("longitude")),
        ),
        lineup=list(e.get("lineup") or []),
        url=e.get("url", ""),
        source="bandsintown-rest",
    )


def _float(x) -> float | None:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None
