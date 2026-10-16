"""Daily listener-count snapshots. Last.fm has no history API, so we build our own.

This is what makes velocity possible, and it's the dataset that lets us backtest later.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

from .config import CONFIG, DATA_DIR
from .store import read_json, write_json

LISTENERS_DIR = DATA_DIR / "snapshots" / "listeners"
EVENTS_DIR = DATA_DIR / "snapshots" / "events"


def save_listeners(day: date, counts: dict[str, int], base: Path = LISTENERS_DIR) -> None:
    path = base / f"{day.isoformat()}.json"
    merged = {**read_json(path, {}), **counts}
    write_json(path, merged, compact=True)


def save_events(day: date, events: list[dict], base: Path = EVENTS_DIR) -> None:
    write_json(base / f"{day.isoformat()}.json", events)


def velocity(key: str, today: date, current: int, base: Path = LISTENERS_DIR,
             min_weeks: int = CONFIG.velocity_min_weeks) -> tuple[float, int] | None:
    """Compound weekly listener growth vs. the oldest snapshot in the last 12 weeks.

    Returns (weekly_growth, weeks_observed), or None until we have `min_weeks` of history.
    """
    if not base.exists() or current <= 0:
        return None
    window_start = today - timedelta(weeks=12)
    latest_ok = today - timedelta(weeks=min_weeks)
    for path in sorted(base.glob("*.json")):
        day = date.fromisoformat(path.stem)
        if day < window_start:
            continue
        if day > latest_ok:
            return None
        then = read_json(path, {}).get(key)
        if then:
            days = (today - day).days
            return (current / then) ** (7 / days) - 1, days // 7
    return None
