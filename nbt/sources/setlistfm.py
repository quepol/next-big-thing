"""setlist.fm attended-shows client.

Three uses in the pipeline:
  - attended_artists(): names of every artist the user has seen live → seeded into
    the taste graph and added to "loved". This signal is uncontaminated by kids'
    scrobbles, because attendance is deliberate.
  - attended_venue_names(): lowercased venue names → venue novelty flag in scoring.
  - attended(): full setlist data → retroactive bragging-rights ledger.

The API returns at most 20 setlists per page. The attended list is fetched fresh every
run (a handful of calls), so a show logged yesterday shows up today; caching it for a
week hid new shows for up to seven days.
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
        self._attended: dict[str, list[dict]] = {}

    def _get(self, path: str, *, fresh: bool = False, **params) -> dict:
        key = path + str(sorted(params.items()))
        cached = None if fresh else self._cache.get(key)
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

    def attended(self, user: str = CONFIG.setlistfm_user) -> list[dict]:
        """All attended setlists, newest first. Paginates automatically; fetched once per run."""
        if user in self._attended:
            return self._attended[user]
        results = []
        page = 1
        while True:
            data = self._get(f"/user/{user}/attended", fresh=True, p=page)
            results.extend(data.get("setlist", []))
            total = data["total"]
            per_page = data["itemsPerPage"]
            if page * per_page >= total:
                break
            page += 1
            time.sleep(1.0)
        self._attended[user] = results
        return results

    def attended_artists(self, user: str = CONFIG.setlistfm_user) -> dict[str, str]:
        """Mapping of normalized key → display name for all artists seen live."""
        result: dict[str, str] = {}
        for s in self.attended(user):
            name = s["artist"]["name"]
            result[normalize_name(name)] = name
        return result

    def attended_seen(self, user: str = CONFIG.setlistfm_user) -> dict[str, tuple[int, int]]:
        """Normalized key -> (shows seen, last year seen), for the seen-live seed floor."""
        seen: dict[str, tuple[int, int]] = {}
        for s in self.attended(user):
            key = normalize_name(s["artist"]["name"])
            year = int(s["eventDate"][-4:])  # DD-MM-YYYY
            shows, last = seen.get(key, (0, 0))
            seen[key] = (shows + 1, max(last, year))
        return seen

    def attended_venue_names(self, user: str = CONFIG.setlistfm_user) -> set[str]:
        """Lowercased venue names — used to detect when a show is at a new-to-you venue."""
        return {s["venue"]["name"].lower() for s in self.attended(user)}

    def attended_ledger(
        self, user: str = CONFIG.setlistfm_user, current_listeners: dict[str, int] | None = None
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
