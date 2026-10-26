"""Your listening history, reduced to one row per artist.

We never store raw scrobbles (20 years is a lot of rows). Instead we keep, per artist:
distinct days played, total plays, first and last day. Because scrobbles are processed
oldest-first, "distinct days" can be maintained incrementally: a play counts as a new day
only if its date is later than the artist's last recorded day.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Iterable
from zoneinfo import ZoneInfo

from . import exclusions
from .config import CONFIG, DATA_DIR
from .models import normalize_name
from .store import read_json, write_json

HISTORY_PATH = DATA_DIR / "history.json"
LOCAL_TZ = ZoneInfo(CONFIG.timezone)


def empty_history() -> dict:
    return {"artists": {}, "last_uts": 0, "backfill": None}


def reset() -> None:
    """Clear history so the next sync re-backfills everything (needed to populate days_by_year)."""
    save(empty_history())


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
            year = day[:4]
            dby = row.setdefault("days_by_year", {})
            dby[year] = dby.get(year, 0) + 1
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


def recent_days(row: dict, since_year: int) -> int:
    """Distinct days played from `since_year` on. Without days_by_year, only the last play is known."""
    if row.get("days_by_year"):
        return sum(n for y, n in row["days_by_year"].items() if int(y) >= since_year)
    return 1 if row.get("last", "0")[:4] >= str(since_year) else 0


def loved(history: dict, top_n: int = CONFIG.loved_top_n, excluded: set[str] | None = None,
          loves: set[str] | None = None, today: date | None = None) -> set[str]:
    """Bands worth travelling for: favourites still in rotation, current heavy rotation, and loves.

    - the top `top_n` by days played, if played at all in the recent window
    - anyone with `loved_hot_days` days in the recent window, however few all-time
    - loves.txt (setlist.fm-attended artists are added by the pipeline)

    The window is the last `loved_recent_years` calendar years plus this one, as for seed recency.
    """
    excluded = exclusions.load() if excluded is None else excluded
    loves = {normalize_name(n) for n in (exclusions.load_loves() if loves is None else loves)}
    since = (today or date.today()).year - CONFIG.loved_recent_years
    rows = known(history, excluded=excluded)
    ranked = sorted(rows.items(), key=lambda kv: (-kv[1]["days"], -kv[1]["plays"]))
    rotation = {k for k, v in ranked[:top_n] if recent_days(v, since) >= 1}
    hot = {k for k, v in rows.items() if recent_days(v, since) >= CONFIG.loved_hot_days}
    return rotation | hot | (loves - excluded)
