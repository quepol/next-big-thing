"""Compare a rebuilt history with the one it replaced; exit 1 if the rebuild looks short.

Used once by daily.yml after `nbt rebuild-history`. The rebuild re-reads every scrobble,
so it should find at least the play days the old history had (a few more is normal: plays
scrobbled late). Fewer means the backfill stopped early, and the old history is kept.
"""

import json
import sys

old, new = (json.load(open(p))["artists"] for p in sys.argv[1:3])
old_days = sum(r["days"] for r in old.values())
new_days = sum(r["days"] for r in new.values())
with_years = sum(1 for r in new.values() if r.get("days_by_year"))
print(f"rebuild: {len(old)} → {len(new)} artists, {old_days} → {new_days} play days, "
      f"{with_years} with days_by_year")
sys.exit(0 if new_days >= old_days and with_years == len(new) else 1)
