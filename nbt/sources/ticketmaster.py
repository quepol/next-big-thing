"""Ticketmaster Discovery API city feed.

Replaces the Bandsintown city_events() path, which is blocked by Cloudflare
from any server/CI IP. Ticketmaster has a free documented API, includes
TicketWeb (used by most small Toronto clubs), and returns opener data in
_embedded.attractions for roughly 28% of shows.
"""

from __future__ import annotations

import time
from datetime import date, timedelta

import requests

from ..config import CONFIG, Region, DATA_DIR
from ..models import Event, Venue
from ..store import Cache

BASE = "https://app.ticketmaster.com/discovery/v2"

# Approximate capacities keyed by Ticketmaster venue ID.
# Used for the soft venue-size bonus in the next-big-thing score.
# Capacities are estimates from public sources; update as needed.
VENUE_CAPACITY: dict[str, int] = {
    "KovZ917AJ4f":   2500,   # History Toronto
    "KovZpa3yBe":    1400,   # The Danforth Music Hall
    "KovZpZAFlF1A":   575,   # The Mod Club
    "KovZpZAFlvvA":   900,   # The Opera House
    "rZ7HnEZaeOT":    700,   # Lee's Palace
    "KovZpZAFlekA":   250,   # The Drake Hotel
    "rZ7HnEZaenE":    200,   # Drake Underground
    "KovZpZAFnlnA":  2765,   # Massey Hall
    "KovZpZAdtAeA":   300,   # The Garrison
    "KovZpZAFFE1A": 19800,   # Scotiabank Arena
    "rZ7HnEZaeN0":    300,   # Sneaky Dee's Concert Venue
    "rZ7HnEZ17oOAg":  400,   # The Dance Cave
    "rZ7HnEZa7oi":    850,   # The Concert Hall
    "KovZpZAdIFaA":  5000,   # REBEL
    "KovZpZAFla7A":  1800,   # Meridian Arts Centre: George Weston
    "rZ7HnEZaA3Z":    700,   # CODA
    "KovZpZAFledA":   600,   # The Great Hall
    "rZ7HnEZ17AYAP":  350,   # Rockpile Rock Bar
    "KovZ917AqfB":    200,   # The Baby G
    "rZ7HnEZ17F_p4":  250,   # Monarch Tavern
    "KovZpZAdt7JA":   400,   # Horseshoe Tavern
    "rZ7HnEZae-Z":    400,   # The Horseshoe Tavern (TicketWeb listing)
    "rZ7HnEZaeih":   1000,   # The Phoenix Concert Theatre
    "KovZpZAJktIA":   150,   # Soybomb
    "KovZpZAFlvdA":   200,   # Rivoli
    "KovZpZAJe7FA":   500,   # Adelaide Hall
    "rZ7HnEZ17F_jP":  200,   # Hard Luck Bar
    "rZ7HnEZadhi":    200,   # Supermarket
    "rZ7HnEZ173Fx4":  300,   # The Starlight Room at El Mocambo
    "rZ7HnEZae-S":    500,   # Under the Neon Palms at El Mocambo
    "KovZ917Acak":   1200,   # Ada Slaight Hall
    "KovZpa3Bbe":   50000,   # Rogers Centre
    "KovZ917ARzt":  45000,   # Rogers Stadium
    "KovZpZAJt7FA":  8000,   # Coca-Cola Coliseum
    "KovZpZAFl6JA":  2630,   # Roy Thomson Hall
    "KovZ917AR40":   1800,   # Living Arts Centre Auditorium
    "KovZ917AxRZ":    750,   # Paradise Theatre
    "KovZpZAkEJvA":   800,   # The Royal Theatre
    "KovZpZAFFEJA":  3191,   # Meridian Hall
    "KovZpZAk6nnA":  1500,   # Metropolitan United Church
    "rZ7HnEZ178Y04":  500,   # Longboat Hall
    "rZ7HnEZ17ffvA":  400,   # Spot 1 Grill & Music Hall
    "KovZpZAJe7FA":   500,   # Adelaide Hall
    "KovZpZAJktIA":   150,   # Soybomb
    "KovZpZAkJltA":   500,   # Jane Mallett Theatre
    "KovZpZAFFEIA":  5000,   # Mississauga Sports & Entertainment Centre
    "KovZ917Acbk":   2000,   # The Theatre at Great Canadian Toronto
}


class Ticketmaster:
    def __init__(self, api_key: str = CONFIG.ticketmaster_api_key, session: requests.Session | None = None):
        self.api_key = api_key
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = "next-big-thing/0.1 (personal show recommender)"
        self.cache = Cache(DATA_DIR / "cache" / "tm_city_events.json", ttl_days=1)

    def save(self) -> None:
        self.cache.save()

    def city_events(self, region: Region) -> list[Event]:
        if not self.api_key:
            raise RuntimeError("TICKETMASTER_API_KEY is not set")
        cached = self.cache.get(region.name)
        if cached is not None:
            return [_parse_event(e) for e in cached]
        raw = self._fetch_all(region)
        self.cache.set(region.name, raw)
        return [_parse_event(e) for e in raw]

    def _fetch_all(self, region: Region) -> list[dict]:
        today = date.today()
        end = today + timedelta(days=CONFIG.lookahead_days)
        params = {
            "apikey": self.api_key,
            "latlong": f"{region.lat},{region.lon}",
            "radius": int(region.radius_km),
            "unit": "km",
            "classificationName": "music",
            "startDateTime": f"{today}T00:00:00Z",
            "endDateTime": f"{end}T23:59:59Z",
            "size": 200,
            "sort": "date,asc",
        }
        events: list[dict] = []
        page = 0
        while True:
            resp = self.session.get(f"{BASE}/events.json", params={**params, "page": page}, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            events.extend(data.get("_embedded", {}).get("events", []))
            total_pages = data.get("page", {}).get("totalPages", 1)
            if page >= total_pages - 1:
                break
            page += 1
            time.sleep(0.2)
        return events


def _parse_event(e: dict) -> Event:
    v = e.get("_embedded", {}).get("venues", [{}])[0]
    loc = v.get("location", {})

    start = e.get("dates", {}).get("start", {})
    local_date = start.get("localDate", "")
    local_time = start.get("localTime", "00:00:00")
    starts_at = f"{local_date}T{local_time}" if local_date else ""

    attractions = e.get("_embedded", {}).get("attractions", [])
    lineup = [a["name"] for a in attractions] if attractions else ([e["name"]] if e.get("name") else [])

    venue_id = v.get("id", "")
    return Event(
        id=f"tm:{e['id']}",
        starts_at=starts_at,
        venue=Venue(
            name=v.get("name", ""),
            city=v.get("city", {}).get("name", ""),
            lat=_float(loc.get("latitude")),
            lon=_float(loc.get("longitude")),
            capacity=VENUE_CAPACITY.get(venue_id),
        ),
        lineup=lineup,
        url=e.get("url", ""),
        source="ticketmaster",
    )


def _float(x) -> float | None:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None
