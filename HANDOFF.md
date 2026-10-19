# Handoff

Where things stand, for the next session (on the Mac or the phone). Read `CLAUDE.md` first; it has everything that's always true. Update this file at the end of each working session.

_Last updated: 2026-10-19 (cloud session on the phone)._

## Just shipped (on `main`, 2026-10-19)

- **Home-screen icon:** two beamed notes rising into an arrow, white on hot pink, named "NBT" (`site/icons/`). The user has to remove and re-add the home-screen app to see it, and re-adding clears that app's votes and followed rooms.
- **The aughts ladder study ran** (`site/data/ladder_study.json`). It's live on The Climb as the "for pace" box and dashed staircase lines.
  - Benchmark: 2 to 4.5 years from a 300–600 room to 2,300+. Bon Iver was fastest at 1.8 years.
  - Angine de Poitrine (Mod Club to Massey in 2 months) and Jeremie Albino are ahead of that pace.
  - Matt Berninger is a false positive (The National's singer touring solo). The "side project of X" proposal is in #4.
- **One footer on every page** (`site/foot.js`):
  - the site icon
  - Picks and Explore links (SF overlap is linked only from Explore)
  - Loaded · Refresh (keeps the tab hash) and the hour-away auto-refresh
  - the theme switch, moved here from the Picks header
  - a muted "Code on GitHub" link
- **Picks header line:** "Updated <weekday time> · N upcoming shows checked against N bands you know · Growth tracking: day N of 28".
- **README "Make your own":** 8 steps for anyone with a Last.fm account. Setting it up showed a fork would have scored against quepol's history, so:
  - `LASTFM_USER` and `SETLISTFM_USER` now come from repository variables (unset means quepol)
  - the timezone moved to `nbt/config.py`
  - `.env.example` exists

  Picks are unchanged.
- **Venue research re-ran on its own** (2026-10-19), so the SF overlap data is a day fresher.

Earlier (2026-10-18): the Explore page (Rooms and The Climb tabs, search, band sheet), `digest.calendar` in the pipeline, billing from co-bills, and the docs split into `CLAUDE.md`, `docs/` and Issues.

## Check next session

1. **Today's daily run hadn't landed by 11:30 UTC.** GitHub's scheduler has started the 10:17 UTC cron about 3.5 hours late on previous days. Confirm a "Daily snapshot 2026-10-19" commit exists and that `digest.calendar` is populated. Then open `explore.html#rooms` (room scores real, not empty) and check the "Next: …" dates on The Climb. If the run never came, ask the user to click Run workflow on Daily digest (dispatching it from a cloud session gets a 403).
2. **The Picks header's "Updated" weekday** should read the current day once the run lands.
3. **Research data is a snapshot.** It goes stale until a weekly refresh exists (#4, #6).

## Active issues

- **#3:** scoring and UX ideas, including the "revisit after a few weeks" list (out-of-town cutoff, NBT ceiling, strength thresholds, velocity).
- **#4:** venue overlap and the ladder. The ladder study is done. Open: flagging side projects, momentum in the main picks (needs the user's OK), a weekly refresh, small-room gaps.
- **#5:** follow bands and rooms, a watchlist and alerts. Follows and votes are per browser, and re-adding the home-screen app wipes them, which argues for `data/follows.txt` sooner.
- **#6:** pipeline housekeeping.
- **#7:** bigger feature ideas.

## In flight / not started

- Nothing half-built. The dev branch matches `main`.
- The user is using the explore page for a while before deciding on momentum in scoring (#4) or the watchlist (#5).
