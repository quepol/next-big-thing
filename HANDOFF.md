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
- **Housekeeping (#6, closed):**
  - Bandsintown removed. Out-of-town alerts had never worked: Ticketmaster is now asked for Hamilton and Buffalo too.
  - Last.fm lookups use straight quotes.
  - Actions bumped to Node 24 versions.
  - A backup cron runs at ~11:47am Toronto.
  - Tests run on `main` for Python changes only, and each research study runs only when its own script changes.
- **Venue research re-ran on its own** (2026-10-19), so the SF overlap data is a day fresher.

Earlier (2026-10-18): the Explore page (Rooms and The Climb tabs, search, band sheet), `digest.calendar` in the pipeline, billing from co-bills, and the docs split into `CLAUDE.md`, `docs/` and Issues.

## Check next session

1. **The first Hamilton and Buffalo shows** (2026-10-20 run). The events snapshot should have regions other than Toronto, and "Bands you know" may show an out-of-town pick, but only for loved bands. If the snapshot is still 100% Toronto, check the "city feed for …" lines in the run log.
2. **The backup cron** (~11:47am Toronto) should log "Today's digest is already on main; skipping." when the 6am run has landed.
3. **Research data is a snapshot.** It goes stale until a weekly refresh exists (#4).

## Active issues

- **#3:** scoring and UX ideas, including the "revisit after a few weeks" list (out-of-town cutoff, NBT ceiling, strength thresholds, velocity).
- **#4:** venue overlap and the ladder. The ladder study is done. Open: flagging side projects, momentum in the main picks (needs the user's OK), a weekly refresh, small-room gaps.
- **#5:** follow bands and rooms, a watchlist and alerts. Follows and votes are per browser, and re-adding the home-screen app wipes them, which argues for `data/follows.txt` sooner.
- **#7:** bigger feature ideas.

## In flight / not started

- Nothing half-built. The dev branch matches `main`.
- The user is using the explore page for a while before deciding on momentum in scoring (#4) or the watchlist (#5).
