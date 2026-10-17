"""setlist.fm attended-shows client.

Three uses in the pipeline:
  - attended_artists(): names of every artist the user has seen live → seeded into
    the taste graph and added to "loved". This signal is uncontaminated by kids'
    scrobbles, because attendance is deliberate.
  - attended_venue_names(): lowercased venue names → venue novelty flag in scoring.
  - attended(): full setlist data → retroactive bragging-rights ledger.

The API returns at most 20 setlists per page. We page through all of them once and
cache the results for a week (setlists don't change much).
"""

from __future__ import annotations

import time

import requests

from ..config import CONFIG, DATA_DIR
from ..models import normalize_name
from ..store import Cache

BASE = "https://api.setlist.fm/rest/1.0"


class SetlistFM:
    def __init__(self, api_key: str = CONFIG.setlistfm_api_key):
        self.api_key = api_key
        self._cache = Cache(DATA_DIR / "cache" / "setlistfm.json", ttl_days=7)

    def _get(self, path: str, **params) -> dict:
        key = path + str(sorted(params.items()))
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        for attempt in range(3):
            resp = requests.get(
                f"{BASE}{path}",
                headers={"x-api-key": self.api_key, "Accept": "application/json"},
                params=params,
                timeout=10,
            )
            if resp.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            resp.raise_for_status()
            data = resp.json()
            self._cache.set(key, data)
            return data
        resp.raise_for_status()  # raise after 3 rate-limit failures
        return {}  # unreachable

    def attended(self, user: str = CONFIG.lastfm_user) -> list[dict]:
        """All attended setlists, newest first. Paginates automatically."""
        results = []
        page = 1
        while True:
            data = self._get(f"/user/{user}/attended", p=page)
            results.extend(data.get("setlist", []))
            total = data["total"]
            per_page = data["itemsPerPage"]
            if page * per_page >= total:
                break
            page += 1
            time.sleep(1.0)
        return results

    def attended_artists(self, user: str = CONFIG.lastfm_user) -> dict[str, str]:
        """Mapping of normalized key → display name for all artists seen live."""
        result: dict[str, str] = {}
        for s in self.attended(user):
            name = s["artist"]["name"]
            result[normalize_name(name)] = name
        return result

    def attended_venue_names(self, user: str = CONFIG.lastfm_user) -> set[str]:
        """Lowercased venue names — used to detect when a show is at a new-to-you venue."""
        return {s["venue"]["name"].lower() for s in self.attended(user)}

    def attended_ledger(
        self, user: str = CONFIG.lastfm_user, current_listeners: dict[str, int] | None = None
    ) -> list[dict]:
        """Retroactive bragging-rights ledger: every attended show with current listener counts.

        current_listeners is a dict of normalized_key → listener count, populated by the
        pipeline after fetching artist_info. Rows without a match get listeners_now=None.
        """
        current_listeners = current_listeners or {}
        rows = []
        for s in self.attended(user):
            name = s["artist"]["name"]
            key = normalize_name(name)
            rows.append({
                "artist": name,
                "date": s["eventDate"],  # DD-MM-YYYY
                "venue": s["venue"]["name"],
                "city": s["venue"]["city"]["name"],
                "listeners_now": current_listeners.get(key),
            })
        return rows

    def save(self) -> None:
        self._cache.save()
