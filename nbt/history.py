"""Your listening history, reduced to one row per artist.

We never store raw scrobbles (20 years is a lot of rows). Instead we keep, per artist:
distinct days played, total plays, first and last day. Because scrobbles are processed
oldest-first, "distinct days" can be maintained incrementally: a play counts as a new day
only if its date is later than the artist's last recorded day.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable
from zoneinfo import ZoneInfo

from . import exclusions
from .config import CONFIG, DATA_DIR
from .models import normalize_name
from .store import read_json, write_json

HISTORY_PATH = DATA_DIR / "history.json"
LOCAL_TZ = ZoneInfo("America/Toronto")


def empty_history() -> dict:
    return {"artists": {}, "last_uts": 0, "backfill": None}


def load() -> dict:
    return read_json(HISTORY_PATH, None) or empty_history()


def save(history: dict) -> None:
    write_json(HISTORY_PATH, history, compact=True)


def ingest(history: dict, scrobbles: Iterable[dict]) -> int:
    """Fold a batch of scrobbles (sorted here; batches must arrive oldest-first) into the per-artist table. Returns count."""
    artists = history["artists"]
    n = 0
    for s in sorted(scrobbles, key=lambda s: s["uts"]):
        if s["uts"] <= history["last_uts"]:
            continue
        day = datetime.fromtimestamp(s["uts"], timezone.utc).astimezone(LOCAL_TZ).date().isoformat()
        key = normalize_name(s["artist"])
        if not key:
            continue
        row = artists.get(key)
        if row is None:
            row = artists[key] = {"name": s["artist"], "days": 0, "plays": 0, "first": day, "last": day}
        row["plays"] += 1
        if row["days"] == 0 or day > row["last"]:
            row["days"] += 1
            row["last"] = day
        history["last_uts"] = s["uts"]
        n += 1
    return n


def sync(lastfm, user: str = CONFIG.lastfm_user, *, log=print) -> dict:
    """Backfill (resumably) or top up the history from Last.fm."""
    history = load()
    bf = history.get("backfill")
    if history["last_uts"] == 0 and bf is None:
        bf = history["backfill"] = {"until": int(datetime.now(timezone.utc).timestamp()), "next_page": None}

    if bf is not None:
        log(f"backfilling scrobbles up to {bf['until']} (resume page {bf['next_page']})")
        for page, total, scrobbles in lastfm.recent_tracks(user, until=bf["until"], start_page=bf["next_page"]):
            ingest(history, scrobbles)
            bf["next_page"] = page - 1
            if page % 25 == 0:
                log(f"  page {page}/{total}")
                save(history)
        history["backfill"] = None
        save(history)

    added = 0
    for _, _, scrobbles in lastfm.recent_tracks(user, since=history["last_uts"] + 1):
        added += ingest(history, scrobbles)
    save(history)
    log(f"history: {len(history['artists'])} artists, +{added} new scrobbles")
    return history


def known(history: dict, min_days: int = CONFIG.known_min_days,
          excluded: set[str] | None = None) -> dict[str, dict]:
    excluded = exclusions.load() if excluded is None else excluded
    return {k: v for k, v in history["artists"].items() if v["days"] >= min_days and k not in excluded}


def loved(history: dict, top_n: int = CONFIG.loved_top_n, excluded: set[str] | None = None) -> set[str]:
    rows = sorted(known(history, excluded=excluded).items(), key=lambda kv: (-kv[1]["days"], -kv[1]["plays"]))
    return {k for k, _ in rows[:top_n]}
