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


# Typographic quotes ("Arm’s Length") and Unicode dashes (setlist.fm's "alt‐J", U+2010)
# make Last.fm land on a near-empty page, so an established band looks tiny. Look names
# up with straight quotes and plain hyphens.
CURLY = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"'})
QUOTES = set("'\"’‘“”")
DASHES = set("\u2010\u2011\u2012\u2013\u2014\u2015\u2212")
PLAIN = str.maketrans({**{c: "-" for c in DASHES}, "’": "'", "‘": "'", "“": '"', "”": '"'})


def lastfm_name(name: str) -> str:
    return name.translate(PLAIN)


def cache_key(name: str) -> str:
    """normalize_name() drops quotes and dashes, so "Arm’s Length" and "Arm's Length" share
    a key, and answers fetched before each fix are cached under it. Names with a quote get
    their own key (q:…), names with a Unicode dash d:…, which refetches just those once;
    every other entry stays warm."""
    key = normalize_name(name)
    if QUOTES & set(name):
        return f"q:{key}"
    return f"d:{key}" if DASHES & set(name) else key


# Below this many listeners, check whether a stylised spelling ("half•alive") is the
# real artist; it has to be at least ALIAS_MIN_RATIO times bigger to win.
ALIAS_CHECK_BELOW = 20_000
ALIAS_MIN_RATIO = 10
# Bumped when the check improves, so small answers checked by an older version get one
# re-check. 2: search with the plain name, and accept a match spelled exactly like ours
# (Last.fm's own name page for "Florence + the Machine" is the wrong, near-empty one).
ALIAS_VERSION = 2


def _plain(name: str) -> bool:
    """Only ASCII letters, digits and spaces."""
    return name.isascii() and name.replace(" ", "").isalnum()


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
        key = cache_key(name)
        cached = self.info_cache.get(key)
        # Small answers cached before the current stylised-name check get one re-check.
        # Version 2 only changed names with punctuation or symbols, so plain ones skip it.
        if cached is not None and (not cached or cached["listeners"] >= ALIAS_CHECK_BELOW
                                   or cached.get("alias_checked") == ALIAS_VERSION
                                   or (cached.get("alias_checked") and _plain(name))):
            return cached or None
        info = self._getinfo(name)
        if not info or info["listeners"] < ALIAS_CHECK_BELOW:
            better = self._stylised_match(name, info["listeners"] if info else 0)
            if better:
                # By ID where Last.fm has one: the name page is what went wrong.
                found = self._getinfo(better["name"], mbid=better.get("mbid", ""))
                if found:
                    info = found
                    info["via"] = {"mbid": better["mbid"]} if better.get("mbid") else {"artist": found["name"]}
            if info:
                info["alias_checked"] = ALIAS_VERSION
        self.info_cache.set(key, info or {})
        return info or None

    def _lookup(self, name: str) -> tuple[dict, str]:
        """Request params for similar/tags, and their cache key. An artist resolved to a
        different page by the stylised-name check is looked up the same way, under its own key."""
        key = cache_key(name)
        # Names with punctuation or symbols are the ones that land on wrong pages, so they
        # are resolved first. Plain names use whatever is cached: the kids' tag check asks
        # for tags of every known artist, and a lookup each would add thousands of calls.
        info = self.artist_info(name) if not _plain(name) else self.info_cache.get(key)
        via = (info or {}).get("via")
        if via:
            return via, f"{key}@{via.get('mbid') or via.get('artist')}"
        return {"artist": lastfm_name(name)}, key

    def _getinfo(self, name: str, mbid: str = "") -> dict:
        who = {"mbid": mbid} if mbid else {"artist": lastfm_name(name)}
        body = self.call("artist.getinfo", **who, autocorrect=1)
        if not body or "artist" not in body:
            return {}
        a = body["artist"]
        tags = a.get("tags", {}).get("tag", [])
        if isinstance(tags, dict):
            tags = [tags]
        return {
            "name": a["name"],
            "mbid": a.get("mbid", ""),
            "listeners": int(a["stats"]["listeners"]),
            "playcount": int(a["stats"]["playcount"]),
            "tags": [t["name"].lower() for t in tags],
            "url": a.get("url", ""),
        }

    def _stylised_match(self, name: str, listeners: int) -> dict | None:
        """A far bigger artist whose name only differs in punctuation, if there is one:
        the search result {"name", "mbid", "listeners"}.

        Ticketmaster writes "half alive"; the band is "half•alive" on Last.fm (~1M
        listeners), and the plain spelling lands on a 1,141-listener page, which made an
        established band look like a next big thing. "Florence + the Machine" is the same
        problem with the exact spelling, so a match can be spelled exactly like ours.

        Search is fuzzy, so it gets the plain name ("florence the machine"). It ranks
        popular artists first, so a match must have the same name, punctuation aside, and
        10x the listeners: a tiny band must never turn into a big one with a similar name.
        """
        body = self.call("artist.search", artist=normalize_name(name), limit=10)
        found = (body or {}).get("results", {}).get("artistmatches", {}).get("artist", [])
        if isinstance(found, dict):
            found = [found]
        want = normalize_name(name)
        same = [a for a in found if normalize_name(a["name"]) == want]
        best = max(same, key=lambda a: int(a.get("listeners") or 0), default=None)
        if best and int(best.get("listeners") or 0) >= max(listeners, 1) * ALIAS_MIN_RATIO:
            return best
        return None

    def similar(self, name: str) -> list[tuple[str, float]]:
        who, key = self._lookup(name)
        cached = self.similar_cache.get(key)
        if cached is not None:
            return [tuple(x) for x in cached]
        body = self.call("artist.getsimilar", **who, autocorrect=1, limit=CONFIG.similar_limit)
        items = body.get("similarartists", {}).get("artist", []) if body else []
        if isinstance(items, dict):
            items = [items]
        result = [(a["name"], float(a["match"])) for a in items]
        self.similar_cache.set(key, result)
        return result

    def top_tags(self, name: str) -> dict[str, int]:
        who, key = self._lookup(name)
        cached = self.tags_cache.get(key)
        if cached is not None:
            return cached
        body = self.call("artist.gettoptags", **who, autocorrect=1)
        items = body.get("toptags", {}).get("tag", []) if body else []
        if isinstance(items, dict):
            items = [items]
        result = {t["name"].lower(): int(t["count"]) for t in items[:20] if int(t["count"]) > 0}
        self.tags_cache.set(key, result)
        return result
