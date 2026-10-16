"""The bragging-rights ledger: when we first flagged an artist, and how big they were then.

Over time this answers "you were told about them at 3.1k listeners; they're at 410k now",
and doubles as the label set for backtesting the next-big-thing score.
"""

from __future__ import annotations

from datetime import date

from .config import DATA_DIR
from .models import Pick, normalize_name
from .store import read_json, write_json

LEDGER_PATH = DATA_DIR / "ledger.json"


def load() -> dict:
    return read_json(LEDGER_PATH, {})


def update(ledger: dict, picks: list[Pick], today: date, current_listeners: dict[str, int]) -> dict:
    for p in picks:
        if p.tier != "next_big_thing":
            continue
        key = normalize_name(p.artist)
        if key not in ledger:
            ledger[key] = {
                "artist": p.artist,
                "first_flagged": today.isoformat(),
                "listeners_at_flag": p.listeners,
                "score_at_flag": round(p.score, 4),
                "event": {"starts_at": p.event.starts_at, "venue": p.event.venue.name, "url": p.event.url},
                "reasons": p.reasons,
            }
    for key, row in ledger.items():
        if key in current_listeners:
            row["listeners_now"] = current_listeners[key]
            row["checked"] = today.isoformat()
    return ledger


def save(ledger: dict) -> None:
    write_json(LEDGER_PATH, ledger)
