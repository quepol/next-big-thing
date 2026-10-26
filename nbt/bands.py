"""The "Your bands" table for Backstage: who's worth the trip, who seeds your taste, and why.

Rows are every artist on either list, plus top-N-by-days artists that dropped off the
worth-the-trip list (old favourites not played lately), so they can be added to loves.txt.
"""

from __future__ import annotations

from datetime import date

from . import history as hist
from .config import CONFIG


def table(history: dict, why: dict[str, list[str]], seeds: list[str], weights: dict[str, float],
          names: dict[str, str], excluded: set[str], today: date | None = None) -> list[dict]:
    """why: travel reasons per key ("rotation", "heavy", "love", "live"). seeds in rank order.
    names: display names for artists not in history (attended-only)."""
    since = (today or date.today()).year - CONFIG.loved_recent_years
    artists = history["artists"]
    known = hist.known(history, excluded=excluded)
    top = [k for k, _ in sorted(known.items(), key=lambda kv: (-kv[1]["days"], -kv[1]["plays"]))]
    top_rank = {k: i + 1 for i, k in enumerate(top[: CONFIG.loved_top_n])}
    seed_rank = {k: i + 1 for i, k in enumerate(seeds)}

    rows = []
    for k in set(why) | set(seeds) | set(top_rank):
        r = artists.get(k)
        rows.append({
            "artist": r["name"] if r else names.get(k, k),
            "days": r["days"] if r else 0,
            "plays": r["plays"] if r else 0,
            "recent": hist.recent_days(r, since) if r else 0,
            "last": r["last"] if r else None,
            "top": top_rank.get(k),
            "travel": why.get(k, []),
            "seed": seed_rank.get(k),
            "weight": round(weights[k], 3) if k in seed_rank and k in weights else None,
        })
    rows.sort(key=lambda r: (-r["days"], r["artist"].casefold()))
    return rows
