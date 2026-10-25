"""Compare a rebuilt history with the one it replaced; exit 1 if the rebuild looks short.

Used once by daily.yml after `nbt rebuild-history`. The rebuild re-reads every scrobble,
so it should find about the play days the old history had. A few fewer is normal: scrobbles
deleted on Last.fm since, or artist names Last.fm has since merged (the Oct 25 attempt came
back 12 of 31,739 days and 7 of 6,442 artists short, with every page read). More than 0.5%
fewer means the backfill stopped early, and the old history is kept.
"""

import json
import sys

TOLERANCE = 0.005

old, new = (json.load(open(p))["artists"] for p in sys.argv[1:3])
old_days = sum(r["days"] for r in old.values())
new_days = sum(r["days"] for r in new.values())
with_years = sum(1 for r in new.values() if r.get("days_by_year"))
print(f"rebuild: {len(old)} → {len(new)} artists, {old_days} → {new_days} play days, "
      f"{with_years} with days_by_year")

lost = sorted(((r["days"] - new.get(k, {}).get("days", 0), r["name"], k in new) for k, r in old.items()), reverse=True)
for n, name, kept in [x for x in lost if x[0] > 0][:10]:
    print(f"  {name}: {n} fewer day(s){'' if kept else ' (gone)'}")

ok = new_days >= old_days * (1 - TOLERANCE) and with_years == len(new)
sys.exit(0 if ok else 1)
