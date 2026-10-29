# Handoff

What a new session needs to pick up. Read `CLAUDE.md` first; it has everything that's always true, and `docs/` has the detail. Keep this file short: open decisions, open checks, dates to watch. Shipped work lives in the commit log, not here.

_Last updated: 2026-10-27 (cloud session on the phone)._

**Status:** the site is live and the daily run lands around 6am Toronto. Nothing is half-built, and the dev branch matches `main`. The user is living with the site for a few weeks before deciding the scoring questions below, so don't change cutoffs unasked.

## Decisions waiting on the user

| When | Decision | Where |
|---|---|---|
| ~mid-Nov | Scoring tune-up: the "You'd probably like" entry bar (0.35 → ~0.40) and listener ceiling, the next-big-thing ceiling, re-anchoring the 1–10 scale, the velocity check. Momentum in the picks too, in order: a weekly research refresh, a side-project flag (Matt Berninger, Adam Cohen), then the boost. | #11 |
| Before the ledger redesign | Move votes and follows out of the browser. Proposal: a "Send" button that opens a pre-filled GitHub issue, which an Action commits; no token. | #5 |
| ~mid-Dec | Ledger redesign around "Was I early, and did I go?" | #12 |

Already decided, don't re-ask:
- Keep the routes that bring in Doja Cat and Little River Band.
- Don't add old favourites (Joshua Radin, Hunter Parrish) to `loves.txt`.
- Leave `exclude.txt` without the keeps for Hunter Parrish, Julie Andrews, Selena Gomez and Central Park Cast.
- The raw score stays off the cards; the 1–10 number is the sanity check.

## Check next session

1. **Which artist did the kids' tag filter exclude?** Since Oct 21 one artist is excluded automatically. Since Oct 29 the run log names it ("auto-excluded: …"). Tell the user which one; it's their call, not a surprise.
2. **Ask the user how these feel after a week of use:**
   - the 1–10 ceilings (next big thing 10 = raw 0.50; Bands you know 10 = 50 days)
   - Strong-from-bonuses on Your rooms (TALK: a known band with little taste fit)
   - the frozen tab bar in the home-screen app (it should sit just under the iPhone status bar)
   - the Backstage Bands tab (new Oct 26), and whether Florence + the Machine should go in `loves.txt`: since the #8 fix she's a seed at only 0.47 (6 days since 2023)
3. **Check the daily run log for a `loves.txt` warning** (names that match nothing in the history; "Haley Williams" was one).

## Dates to watch

- **~Nov 14:** next big thing velocity switches on (28 days of listener snapshots). Check the first growth-scored picks and whether the 1–10 ceiling for next big thing needs raising (velocity adds up to +0.3).
- **~mid-Dec:** the ledger's "too soon to tell" window ends, so the redesign has data to work with.

## Background, low priority

- Research data (SF overlap, The Climb) is an Oct 18 snapshot until a weekly refresh exists (#11, the first momentum step).
- One Node 20 warning remains, from `upload-pages-artifact`.

## Active issues

- **#10:** bug: event titles used as artist names (~70 small-room acts never scored). Next up.
- **#11:** scoring tune-up and momentum, mid-November.
- **#12:** ledger redesign, mid-December (needs #5 first).
- **#5:** follows, the watchlist and alerts; moving votes and follows out of the browser.
- **#7:** bigger feature ideas.
