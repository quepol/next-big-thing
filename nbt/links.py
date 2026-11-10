"""Direct listening links for picks, from MusicBrainz: Bandcamp, SoundCloud and YouTube pages.

The site's listen links were searches. With the SoundCloud iOS app installed, a search link
opens the app, which can't search from a link and bounces to Safari. An artist's own page
opens straight in the app, or in the browser without it. MusicBrainz is curated and records
many artists' pages; on 2026-11-10 it had a Bandcamp or SoundCloud page for 18 of 24 picks.

No Spotify: the user's Spotify scrobbles to Last.fm, and sampling a band would make it known.
MusicBrainz asks for one request a second and a User-Agent that identifies the app.
"""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlparse

import requests

from .config import CONFIG, DATA_DIR
from .models import normalize_name
from .store import Cache

API = "https://musicbrainz.org/ws/2"
USER_AGENT = "next-big-thing/0.1 (https://github.com/quepol/next-big-thing)"
MIN_INTERVAL = 1.1  # seconds between requests
SITES = {"bandcamp.com": "bandcamp", "soundcloud.com": "soundcloud", "youtube.com": "youtube"}


def pick_links(relations: list[dict]) -> dict[str, str]:
    """The first Bandcamp, SoundCloud and YouTube URL among an artist's URL relations."""
    out: dict[str, str] = {}
    for r in relations:
        url = (r.get("url") or {}).get("resource", "")
        host = urlparse(url).netloc.lower().removeprefix("www.").removeprefix("m.")
        for domain, site in SITES.items():
            if (host == domain or host.endswith("." + domain)) and site not in out and not r.get("ended"):
                out[site] = url
    return out


class MusicBrainz:
    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.cache = Cache(DATA_DIR / "cache" / "musicbrainz_links.json", CONFIG.cache_ttl_days)
        self._last = 0.0

    def save(self) -> None:
        self.cache.save()

    def call(self, path: str, **params: Any) -> dict | None:
        """The parsed body, or None when MusicBrainz is down or refuses (not cached)."""
        wait = MIN_INTERVAL - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
        try:
            r = self.session.get(f"{API}/{path}", params={**params, "fmt": "json"}, timeout=30)
            if r.status_code == 404:
                return {}
            return r.json() if r.ok else None
        except (requests.RequestException, ValueError):
            return None

    def _mbid(self, name: str) -> str | None:
        """An exact-name search, used only when it finds exactly one confident match.
        "" when there's none; None when MusicBrainz didn't answer."""
        body = self.call("artist", query=f'artist:"{name}"', limit=5)
        if body is None:
            return None
        exact = [a for a in body.get("artists", []) if normalize_name(a.get("name", "")) == normalize_name(name)
                 and int(a.get("score", 0)) >= 95]
        return exact[0]["id"] if len(exact) == 1 else ""

    def links(self, name: str, mbid: str = "") -> dict[str, str]:
        """{"bandcamp"|"soundcloud"|"youtube": url} for an artist; {} when unknown. Cached."""
        key = normalize_name(name)
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        mbid = mbid or self._mbid(name)
        if mbid is None:
            return {}  # MusicBrainz didn't answer: try again tomorrow
        found: dict[str, str] = {}
        if mbid:
            body = self.call(f"artist/{mbid}", inc="url-rels")
            if body is None:
                return {}
            found = pick_links(body.get("relations", []))
        self.cache.set(key, found)
        return found
