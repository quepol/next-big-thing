"""Turn (events × your taste) into picks across three tiers."""

from __future__ import annotations

import math
from datetime import date
from typing import Callable

from . import exclusions
from .config import CONFIG, Config
from .models import Event, Pick, normalize_name

BILL_BONUS = 0.15
VELOCITY_BONUS_CAP = 0.3


def smallness(listeners: int, ceiling: int) -> float:
    """1.0 for a band nobody's heard of, falling (log-scale) to 0 at the ceiling."""
    floor = 100
    if listeners <= floor:
        return 1.0
    return max(0.0, 1 - math.log(listeners / floor) / math.log(ceiling / floor))


def score_events(
    events: list[Event],
    history: dict,
    loved: set[str],
    affinity: Callable[[str], tuple[float, list[str]]],
    artist_info: Callable[[str], dict | None],
    velocity: Callable[[str, int], tuple[float, int] | None],
    regions: dict[str, str],  # region name -> tiers ("all" | "loved")
    cfg: Config = CONFIG,
    excluded: set[str] | None = None,
) -> list[Pick]:
    artists = history["artists"]
    excluded = exclusions.load() if excluded is None else excluded
    picks: list[Pick] = []

    for ev in events:
        keys = [normalize_name(a) for a in ev.lineup]
        known_on_bill = [(a, artists[k]) for a, k in zip(ev.lineup, keys)
                         if k in artists and artists[k]["days"] >= cfg.known_min_days]
        loved_only = regions.get(ev.region, "all") == "loved"

        for artist, key in zip(ev.lineup, keys):
            if not key or key in excluded:
                continue
            row = artists.get(key)

            if row and row["days"] >= cfg.known_min_days:
                if loved_only and key not in loved:
                    continue
                reasons = [f"played on {row['days']} days since {row['first'][:4]} ({row['plays']} plays)"]
                if key in loved:
                    reasons.append("one of your most-played artists")
                picks.append(Pick("know", artist, ev, score=math.log1p(row["days"]), reasons=reasons))
                continue
            if loved_only:
                continue

            aff, reasons = affinity(artist)
            info = artist_info(artist)
            listeners = info["listeners"] if info else None
            heard = {"days": row["days"], "first": row["first"]} if row else None
            if heard:
                reasons.append(f"you played them on {row['days']} day{'s' * (row['days'] > 1)} back in {row['first'][:4]}")

            co = [(a, r) for a, r in known_on_bill if normalize_name(a) != key]
            bonus = 0.0
            if co:
                a, r = max(co, key=lambda x: x[1]["days"])
                bonus = BILL_BONUS
                reasons.append(f"sharing the bill with {a} ({r['days']} days played)")

            is_small = listeners is None or listeners <= cfg.nbt_max_listeners
            if is_small and (aff >= cfg.nbt_min_affinity or (listeners is None and co)):
                small = smallness(listeners or 0, cfg.nbt_max_listeners)
                score = aff * (0.6 + 0.4 * small) + bonus
                if listeners is None:
                    reasons.append("no Last.fm footprint yet")
                else:
                    reasons.append(f"only {listeners:,} listeners on Last.fm")
                    v = velocity(key, listeners)
                    if v and v[0] > 0:
                        growth, weeks = v
                        score += min(growth * 5, VELOCITY_BONUS_CAP)
                        reasons.append(f"listeners growing {growth:+.1%}/week over {weeks} weeks")
                picks.append(Pick("next_big_thing", artist, ev, score, reasons, listeners, heard))
            elif aff + bonus >= cfg.would_like_min_affinity:
                picks.append(Pick("would_like", artist, ev, aff + bonus, reasons, listeners, heard))

    return dedupe(picks)


def dedupe(picks: list[Pick]) -> list[Pick]:
    """One pick per (tier, artist): the earliest date, noting how many other dates there are."""
    best: dict[tuple[str, str], Pick] = {}
    counts: dict[tuple[str, str], int] = {}
    for p in sorted(picks, key=lambda p: p.event.starts_at):
        k = (p.tier, normalize_name(p.artist))
        counts[k] = counts.get(k, 0) + 1
        best.setdefault(k, p)
    for k, p in best.items():
        if counts[k] > 1:
            p.reasons.append(f"+{counts[k] - 1} more date{'s' * (counts[k] > 2)} nearby")
    return sorted(best.values(), key=lambda p: (-p.score, p.event.starts_at))


def is_upcoming(ev: Event, today: date, lookahead_days: int) -> bool:
    d = date.fromisoformat(ev.starts_at[:10])
    return 0 <= (d - today).days <= lookahead_days
