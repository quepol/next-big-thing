"""Minimal Last.fm API client with on-disk caching and polite rate limiting."""

from __future__ import annotations

import time
from typing import Any, Iterator

import requests

from .config import CONFIG, DATA_DIR
from .models import normalize_name
from .store import Cache

API = "https://ws.audioscrobbler.com/2.0/"
MIN_INTERVAL = 0.25  # Last.fm asks for no more than ~5 requests/second
NOT_FOUND = 6
RATE_LIMITED = 29


class LastFMError(RuntimeError):
    pass


class LastFM:
    def __init__(self, api_key: str = CONFIG.lastfm_api_key, session: requests.Session | None = None):
        if not api_key:
            raise LastFMError("LASTFM_API_KEY is not set")
        self.api_key = api_key
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = "next-big-thing/0.1 (personal show recommender)"
        self._last_call = 0.0
        cache_dir = DATA_DIR / "cache"
        self.info_cache = Cache(cache_dir / "artist_info.json", CONFIG.cache_ttl_days)
        # Listener counts move; similarity and tags barely do.
        self.similar_cache = Cache(cache_dir / "artist_similar.json", CONFIG.cache_ttl_days * 3)
        self.tags_cache = Cache(cache_dir / "artist_tags.json", CONFIG.cache_ttl_days * 3)

    def save(self) -> None:
        for c in (self.info_cache, self.similar_cache, self.tags_cache):
            c.save()

    def call(self, method: str, **params: Any) -> dict | None:
        """Returns the parsed body, or None when Last.fm says the entity doesn't exist."""
        params = {"method": method, "api_key": self.api_key, "format": "json", **params}
        for attempt in range(5):
            wait = MIN_INTERVAL - (time.monotonic() - self._last_call)
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()
            try:
                resp = self.session.get(API, params=params, timeout=30)
            except requests.RequestException:
                time.sleep(2**attempt)
                continue
            if resp.status_code >= 500:
                time.sleep(2**attempt)
                continue
            body = resp.json()
            err = body.get("error")
            if err == NOT_FOUND:
                return None
            if err == RATE_LIMITED:
                time.sleep(2 ** (attempt + 2))
                continue
            if err:
                raise LastFMError(f"{method}: {err} {body.get('message')}")
            return body
        raise LastFMError(f"{method}: gave up after retries")

    # --- user history -----------------------------------------------------

    def recent_tracks(self, user: str, *, since: int = 0, until: int | None = None,
                      start_page: int | None = None) -> Iterator[tuple[int, int, list[dict]]]:
        """Yields (page, total_pages, scrobbles) oldest page first.

        Each scrobble is {"artist", "mbid", "uts"}. Last.fm pages newest-first, so we walk
        backwards from the last page; `until` pins the window so new plays don't shift pages.
        """
        base = {"user": user, "limit": 200, "from": since}
        if until:
            base["to"] = until
        first = self.call("user.getrecenttracks", page=1, **base)
        total = int(first["recenttracks"]["@attr"]["totalPages"]) if first else 0
        page = start_page or total
        while page >= 1:
            body = first if page == 1 else self.call("user.getrecenttracks", page=page, **base)
            tracks = body["recenttracks"].get("track", []) if body else []
            if isinstance(tracks, dict):
                tracks = [tracks]
            out = []
            for t in tracks:
                if t.get("@attr", {}).get("nowplaying") or "date" not in t:
                    continue
                out.append({
                    "artist": t["artist"]["#text"],
                    "mbid": t["artist"].get("mbid", ""),
                    "uts": int(t["date"]["uts"]),
                })
            out.sort(key=lambda s: s["uts"])
            yield page, total, out
            page -= 1

    # --- artist lookups (cached) -----------------------------------------

    def artist_info(self, name: str) -> dict | None:
        """{"name", "listeners", "playcount", "tags"} or None if unknown to Last.fm."""
        key = normalize_name(name)
        cached = self.info_cache.get(key)
        if cached is not None:
            return cached or None
        body = self.call("artist.getinfo", artist=name, autocorrect=1)
        info = {}
        if body and "artist" in body:
            a = body["artist"]
            tags = a.get("tags", {}).get("tag", [])
            if isinstance(tags, dict):
                tags = [tags]
            info = {
                "name": a["name"],
                "mbid": a.get("mbid", ""),
                "listeners": int(a["stats"]["listeners"]),
                "playcount": int(a["stats"]["playcount"]),
                "tags": [t["name"].lower() for t in tags],
                "url": a.get("url", ""),
            }
        self.info_cache.set(key, info)
        return info or None

    def similar(self, name: str) -> list[tuple[str, float]]:
        key = normalize_name(name)
        cached = self.similar_cache.get(key)
        if cached is not None:
            return [tuple(x) for x in cached]
        body = self.call("artist.getsimilar", artist=name, autocorrect=1, limit=CONFIG.similar_limit)
        items = body.get("similarartists", {}).get("artist", []) if body else []
        if isinstance(items, dict):
            items = [items]
        result = [(a["name"], float(a["match"])) for a in items]
        self.similar_cache.set(key, result)
        return result

    def top_tags(self, name: str) -> dict[str, int]:
        key = normalize_name(name)
        cached = self.tags_cache.get(key)
        if cached is not None:
            return cached
        body = self.call("artist.gettoptags", artist=name, autocorrect=1)
        items = body.get("toptags", {}).get("tag", []) if body else []
        if isinstance(items, dict):
            items = [items]
        result = {t["name"].lower(): int(t["count"]) for t in items[:20] if int(t["count"]) > 0}
        self.tags_cache.set(key, result)
        return result
