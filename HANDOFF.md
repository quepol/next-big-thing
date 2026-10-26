# Handoff

What a new session needs to pick up. Read `CLAUDE.md` first; it has everything that's always true, and `docs/` has the detail. Keep this file short: open decisions, open checks, dates to watch. Shipped work lives in the commit log, not here.

_Last updated: 2026-10-26 (cloud session on the phone)._

**Status:** the site is live and the daily run lands around 6am Toronto. Nothing is half-built, and the dev branch matches `main`. The user is living with the site for a few weeks before deciding the scoring questions below, so don't change cutoffs unasked.

## Decisions waiting on the user

| When | Decision | Where |
|---|---|---|
| ~mid-Nov | Raise the "You'd probably like" entry bar from 0.35 to ~0.40 (3.0 on the 1–10 scale)? On Oct 22, 10 of its 14 picks were Long shots. | #3 |
| Before the ledger redesign | Move votes and follows out of the browser. Proposal: a "Send" button that opens a pre-filled GitHub issue, which an Action commits; no token. | #5 |
| ~mid-Dec | Ledger redesign around "Was I early, and did I go?" | #3 |
| After using Backstage a while | Momentum in the picks; flagging side projects (Matt Berninger, Adam Cohen) | #4 |

Already decided, don't re-ask:
- Keep the routes that bring in Doja Cat and Little River Band.
- Don't add old favourites (Joshua Radin, Hunter Parrish) to `loves.txt`.
- Leave `exclude.txt` without the keeps for Hunter Parrish, Julie Andrews, Selena Gomez and Central Park Cast.
- The raw score stays off the cards; the 1–10 number is the sanity check.

## Check next session

0. **Possible kids' artists** that came in with the recency-based loved list (Oct 26): The Chalkeaters, Longestsoloever, Jake Daniels, Marshmello. The user hasn't said; ask once. (Linkin Park, Backstreet Boys, Ariana Grande and Teddy Swims are theirs.)

1. **Which artist did the kids' tag filter exclude?** Since Oct 21 the run logs "51 excluded (1 automatically)", where it used to log 0. It's probably one of the four whose keeps were removed. Tell the user which one; it's their call, not a surprise.
2. **Ask the user how these feel after a week of use:**
   - the 1–10 ceilings (next big thing 10 = raw 0.50; Bands you know 10 = 50 days)
   - Strong-from-bonuses on Your rooms (TALK: a known band with little taste fit)
   - the frozen tab bar in the home-screen app (it should sit just under the iPhone status bar)

## Dates to watch

- **~Nov 14:** next big thing velocity switches on (28 days of listener snapshots). Check the first growth-scored picks and whether the 1–10 ceiling for next big thing needs raising (velocity adds up to +0.3).
- **~mid-Dec:** the ledger's "too soon to tell" window ends, so the redesign has data to work with.

## Background, low priority

- Research data (SF overlap, The Climb) is a snapshot until a weekly refresh exists (#4).
- One Node 20 warning remains, from `upload-pages-artifact`.

## Active issues

- **#3:** scoring and UX: the out-of-town list, the "You'd probably like" bar, the ledger redesign, depth-weighting notes.
- **#4:** venue overlap and the ladder: side projects, momentum, a weekly research refresh.
- **#5:** follows, the watchlist and alerts; moving votes and follows out of the browser.
- **#7:** bigger feature ideas.
