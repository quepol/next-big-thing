# Handoff

What a new session needs to pick up. Read `CLAUDE.md` first; it has everything that's always true, and `docs/` has the detail. Keep this file short: open decisions, checks, dates to watch. Shipped work lives in the commit log, not here.

**How it's used:** the user opens a session with "what's up?" or a question from using the site on their phone. Start by pulling `main`, reading the latest daily run's log (picks per tier, the `auto-excluded:` and `loves.txt` warning lines) and checking this file. Then lead with what needs their attention.

_Last updated: 2026-11-07 (cloud session on the phone)._

**Status:**
- The site is live. Since Nov 8 the daily run should land around 6am Toronto (crons moved 2 hours earlier on Nov 7).
- Nothing is half-built, and the dev branch matches `main`.
- The next-big-thing fixes shipped Nov 7:
  - a 1,500-capacity room cap
  - taste evidence required
  - specific tags only, needing 2+ of them, capped at 0.3
  - +0.05 for SF rooms
- **Result:** 6 picks instead of 15, and honest ones. 2 of the 6 (OTNES, Raine Maida) came in on indie rock, indie pop and singer-songwriter alone. That's expected until rarity weighting (#11).

## Decisions waiting on the user

| When | Decision | Where |
|---|---|---|
| Now | Combined event titles ("X w/ Y & Z") hide ~70 small-room acts. Now the best way to widen next big thing, which is thin since the Nov 7 fixes. Recommended next. | #10 |
| ~Nov 14 | Scoring tune-up: rarity-weighted tags (replaces `GENERIC_TAGS`), the "you'd probably like" bar (only ~7 picks now, so maybe leave it) and ceiling, re-anchoring the 1–10 scale, the velocity check. Momentum in order: weekly research refresh, then side projects (rule decided: include them when the user knows the parent band, as with Mike D of the Beastie Boys; not when they don't, as with Raine Maida of Our Lady Peace), then the boost. | #11 |
| Before the ledger redesign | Move votes and follows out of the browser. **Talk to the user before building anything:** they have their own ideas. It's also a prerequisite for the public version (#7). | #5 |
| Hypothetical | A public version for any Last.fm user: username + location (+ optional setlist.fm), automatic cleanup with a preview, room sizes inferred from bookings, a simpler front-end. **Talk to the user before building the front-end or #5.** | #7 |
| ~mid-Dec | Ledger redesign around "Was I early, and did I go?" | #12 |

Already decided, don't re-ask:
- **Known = 3+ days played, everywhere.** 1–2 days counts as unknown on every tab; the Your rooms "Heard before" bonus is gone. A band seen live but played on fewer than 3 days counts for nothing.
- "Similar to" lists its three bands by similarity, highest first. That stays even if scores are ever hidden.
- Keep the routes that bring in Doja Cat and Little River Band.
- Don't add old favourites (Joshua Radin, Hunter Parrish) or Florence + the Machine to `loves.txt`. Leave out the keeps for Hunter Parrish, Julie Andrews, Selena Gomez and Central Park Cast. The kids' tag filter excludes Selena Gomez ("disney"), and the user knows.
- The raw score stays off the cards; the 1–10 number is the sanity check.

## Check next session

1. **Next big thing count.** Expect about 4–8 picks a day. Zero, or back to 15, means something broke.
2. **Run time.** The first runs after the cron move should land around 6am Toronto. The evening before means GitHub's delay shrank; 8am or later means it grew again.
3. **Kids and white noise.** The user keeps finding more and edits `exclude.txt` directly. If a new kids' or sleep-playlist name turns up in the picks or the seeds, flag it. Sleep-playlist names look like 2022 first plays, ~1 play a day, generic ambient names.
4. **1–10 ceilings:** no decision needed from the user; bring numbers to #11. Watch for Bands you know saturating at 10 (anything over 50 days), and for velocity pushing next big thing past 10.

## Dates to watch

- **~Nov 13–14:** next big thing velocity switches on (28 days of listener snapshots). Check the first growth-scored picks and whether the 1–10 ceiling for next big thing needs raising (velocity adds up to +0.3). This is when to do #11.
- **~mid-Dec:** the ledger's "too soon to tell" window ends, so the redesign (#12) has data to work with.

## Background, low priority

- Research data (SF overlap, The Climb) is an Oct 18 snapshot until a weekly refresh exists (#11, the first momentum step).
- One Node 20 warning remains, from `upload-pages-artifact`.
- **One-off Last.fm questions:** a probe workflow on the dev branch (`scripts/lastfm_probe.py` plus `.github/workflows/lastfm-probe.yml`; see commit 5114d0c) answers them in about a minute. Delete it afterwards.

## Active issues

- **#10:** bug: event titles used as artist names. Next up.
- **#11:** scoring tune-up, tags, side projects and momentum, ~Nov 14.
- **#12:** ledger redesign, mid-December (needs #5 first).
- **#5:** follows, the watchlist and alerts; moving votes and follows out of the browser.
- **#7:** bigger feature ideas (email digest, a musicals tier, DICE/box-office rooms).
