# Handoff

Where things stand, for the next session (on the Mac or the phone). Read `CLAUDE.md` first; it has everything that's always true. Update this file at the end of each working session.

_Last updated: 2026-10-22 (cloud session on the phone)._

**Status:** the pipeline runs daily and the site is live. Nothing is half-built, and the dev branch matches `main`. The user is living with the site for a few weeks before deciding the bigger scoring questions below.

## Decisions waiting on the user

| When | Decision | Where |
|---|---|---|
| ~mid-Nov | Raise the "You'd probably like" entry bar from 0.35 to ~0.40 (3.0 on the scale)? On Oct 22, 10 of its 14 picks were Long shots. | #3 |
| ~mid-Nov | Narrow the out-of-town `loved` list: top ~50 by depth × recency, plus `loves.txt` and setlist.fm-attended artists. Fix in the same change: attended artists still need 3+ days played to pass the out-of-town gate. | #3 |
| Before the ledger redesign | Move votes and follows out of the browser. The proposal is a "Send" button that opens a pre-filled GitHub issue, which an Action commits; no token. | #5 |
| ~mid-Dec | Ledger redesign around "Was I early, and did I go?" | #3 |
| After using Explore a while | Momentum in the picks; flagging side projects (Matt Berninger, Adam Cohen) | #4 |

Already decided (2026-10-21), don't re-ask:
- Keep the routes that bring in Doja Cat and Little River Band.
- Don't add old favourites (Joshua Radin, Hunter Parrish) to `loves.txt`.
- Leave `exclude.txt` without the keeps for Hunter Parrish, Julie Andrews, Selena Gomez and Central Park Cast.

## Check next session

1. **Did the earlier crons land near 6am Toronto?** The main cron is now `17 5` (was `17 10`, which started around 11am every day), and the backup is `47 9`. Check the "Daily snapshot" commit times.
2. **Which artist did the kids' tag filter exclude?** The Oct 21 run logged "51 excluded (1 automatically)", where earlier runs logged 0. It's probably one of the four whose keeps were removed. Tell the user which one; it's their call, not a surprise.
3. **half alive should be gone from next big thing** (the stylised-name fix, 5753e70). Its ledger entry was removed by hand on Oct 22.
4. **The 1–10 scale after a week:** do the 10 ceilings feel right? Next big thing tops out at a raw 0.50, which velocity (~Nov 14) may push many picks past. Bands you know is 10 from 50 days.
5. **Your rooms ratings after a week:** does Strong-from-bonuses (a known band with little taste fit, like TALK) feel right, or should Strong need a minimum taste fit?
6. **The new layout on the phone:** Soon and Your rooms on Picks, plus Backstage. The user built it on a Mac; check how it feels on the home-screen app.

## Watch list

- **~Nov 14:** next big thing velocity switches on (28 days of listener snapshots). Look at the first growth-scored picks.
- **~mid-Dec:** the ledger's "too soon to tell" window ends.
- Research data (SF overlap, The Climb) is a snapshot until a weekly refresh exists (#4).
- One Node 20 warning remains, from `upload-pages-artifact`. Low priority.

## Recently shipped

- **Oct 22:**
  - **New layout** from the user's own experiment branch. The picks page has Soon (tonight and tomorrow, all tiers), the three tiers, and Your rooms. Explore became **Backstage**: The Climb, Rivers, Ledger and Attended.
  - half alive removed from the ledger (it was flagged from the wrong Last.fm page).
  - **Your rooms ratings:** Strong ≥ 0.50, Good ≥ 0.30, Worth a look ≥ 0.15 on the show score; below that, the number only. Strong there can come from bonuses alone (TALK).
  - **Scores out of 10 on every tab** (`SCALES` in `site/ladder.js`): 8.0+ Strong, 5.0+ Good, 3.0+ Worth a look, under 3.0 **Long shot**. The label comes from the displayed number. The raw score is only in the tooltip now (the user's call); the 1–10 number is the sanity check.
  - Soon sorts tonight first, then by the 1–10 score.
  - Your rooms: the opener a show scored on is bold in the "with …" line.
  - **Tier chips are pink pills on every card** (picks, Soon, Your rooms, the Backstage band sheet). The design rule in `CLAUDE.md` now allows pink pills for a pick's tier and "Moving up" only.
- **Oct 21:**
  - seeds weighted by listening depth √(days × plays) × recency
  - setlist.fm attended shows fetched fresh every run (111 → 147 shows)
  - stylised Last.fm names resolved (half•alive)
  - `exclude.txt` cleanup (kids' themes, a "Random - do not include" section)
  - crons moved 5 hours earlier
- **Oct 19:**
  - Bandsintown removed, and Ticketmaster now covers Hamilton and Buffalo. Out-of-town alerts had never worked before; the first one is The Wailin' Jennys in Buffalo.
  - a backup cron
  - Node 24 Actions
  - a shared footer
  - the home-screen icon
  - the README "Make your own" steps
  - ladder study pace references on The Climb
- **Oct 18:** the Explore page (Rooms and The Climb), `digest.calendar`, billing from co-bills, and the docs split into `CLAUDE.md`, `docs/` and Issues.

## Active issues

- **#3:** scoring and UX: the out-of-town list, the ledger redesign, depth weighting notes, NBT ceiling and strength thresholds.
- **#4:** venue overlap and the ladder: side projects, momentum, a weekly research refresh.
- **#5:** follows, the watchlist and alerts; moving votes and follows out of the browser.
- **#7:** bigger feature ideas.
