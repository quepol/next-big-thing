"""Sanity check of the taste model against real history. Prints only; writes nothing public."""

from __future__ import annotations

from collections import Counter

from . import history as hist
from .config import CONFIG
from .lastfm import LastFM
from .taste import Taste


def run(top: int = 25) -> None:
    lastfm = LastFM()
    h = hist.sync(lastfm)
    artists = h["artists"]
    known = hist.known(h)
    print(f"\n== history: {len(artists):,} artists, {sum(a['plays'] for a in artists.values()):,} plays")
    buckets = Counter(
        "1 day" if a["days"] == 1 else "2 days" if a["days"] == 2 else
        "3-9 days" if a["days"] < 10 else "10-99 days" if a["days"] < 100 else "100+ days"
        for a in artists.values()
    )
    for b in ("1 day", "2 days", "3-9 days", "10-99 days", "100+ days"):
        print(f"   {b:>10}: {buckets[b]:,}")
    print(f"   known (>= {CONFIG.known_min_days} days): {len(known):,}; loved = top {CONFIG.loved_top_n}")

    ranked = sorted(known.values(), key=lambda a: (-a["days"], -a["plays"]))
    print(f"\n== top {top} seeds by distinct days")
    for a in ranked[:top]:
        print(f"   {a['days']:>5} days  {a['plays']:>6} plays  {a['first']}..{a['last']}  {a['name']}")

    print("\n== building taste graph")
    taste = Taste(h, lastfm)
    lastfm.save()
    print(f"   {len(taste.forward):,} unknown artists reachable from {len(taste.seeds)} seeds")
    print(f"   tag profile: {', '.join(sorted(taste.tag_profile, key=lambda t: -taste.tag_profile[t])[:15])}")

    print(f"\n== top {top} unknown artists the graph points at (these drive 'you'd probably like')")
    for name in taste.top_neighbours(top):
        aff, reasons = taste.affinity(name)
        info = lastfm.artist_info(name)
        listeners = f"{info['listeners']:,}" if info else "?"
        print(f"   {aff:.2f}  {listeners:>10} listeners  {name}  -- {'; '.join(reasons)}")

    small = []
    for name in taste.top_neighbours(400):
        info = lastfm.artist_info(name)
        if info and info["listeners"] <= CONFIG.nbt_max_listeners:
            small.append((taste.affinity(name)[0], info["listeners"], name))
    lastfm.save()
    print(f"\n== small (<= {CONFIG.nbt_max_listeners:,} listeners) artists near your taste: "
          f"what next-big-thing picks would look like")
    for aff, listeners, name in sorted(small, reverse=True)[:top]:
        print(f"   {aff:.2f}  {listeners:>8,} listeners  {name}")
