# Handoff

Where things stand, for the next session (on the Mac or the phone). Read `CLAUDE.md` first; it has everything that's always true. Update this file at the end of each working session.

_Last updated: 2026-10-18 (cloud session on the phone)._

## Just shipped (on `main`)

- **Explore page** (`site/explore.html`) with two tabs.
  - **The Climb:** a ranked list of bands headlining bigger Toronto rooms, with growth, time and the next date.
  - **Rooms:** "Your rooms" ranks upcoming shows at followed rooms; Room rivers opens band cards filtered by tier.
  - A header search; band cards open as a sheet with listen and ticket links.
- **Pipeline:** the digest now includes a `calendar` of every upcoming show, with per-act scores. It feeds the room view; picks are unchanged.
- **Research:** billing inferred from co-bills, a "moving up" list, and taste tiers for the 1,515 bands that played both an SF room and Toronto.
- **Home-screen icon:** two beamed notes rising into an arrow, white on hot pink, named "NBT" (`site/icons/`). The user has to remove and re-add the home-screen app to see it.
- The docs split: `CLAUDE.md`, `docs/`, and Issues as the backlog.
- Band sheet restyled like the picks cards (strength badge, chips, why line with weights), a dark-mode sheet, listen links on room cards, "Explore" in the picks footer, and dated Toronto shows for every shared band.

## Check next session

1. **The first daily run with `calendar`** (6am Toronto, 2026-10-19). Open `explore.html#rooms` and check the room scores are real (not empty) and that "Next: …" dates show on The Climb.
2. **The aughts ladder study is done** (2026-10-19) and live on The Climb as the "for pace" box and the dashed lines. Benchmark: 2 to 4.5 years from a 300–600 room to 2,300+. Matt Berninger's climb is a false positive (The National's singer touring solo); flagging side projects belongs in #4.
3. **Research data is a snapshot from 2026-10-18.** It goes stale until a weekly refresh exists (#4, #6).

## Active issues

- **#3:** scoring and UX ideas, including the "revisit after a few weeks" list (out-of-town cutoff, NBT ceiling, strength thresholds, velocity).
- **#4:** venue overlap and the ladder. Open: the ladder study, momentum in the main picks (needs the user's OK), a weekly refresh, small-room gaps.
- **#5:** follow bands and rooms, a watchlist and alerts. Decisions are recorded there.
- **#6:** pipeline housekeeping.
- **#7:** bigger feature ideas.

## In flight / not started

- Nothing half-built. The dev branch matches `main`.
- The user was going to use the explore page for a while before deciding on momentum in scoring (#4) or the watchlist (#5).
