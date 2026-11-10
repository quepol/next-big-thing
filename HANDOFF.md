# Handoff

What a new session needs to pick up. Read `CLAUDE.md` first; it has everything that's always true, and `docs/` has the detail. Keep this file short: open decisions, checks, dates to watch. Shipped work lives in the commit log, not here.

**How it's used:** the user opens a session with "what's up?" or a question from using the site on their phone. Start by pulling `main`, reading the latest daily run's log (picks per tier, the `auto-excluded:` and `loves.txt` warning lines) and checking this file. Then lead with what needs their attention.

_Last updated: 2026-11-10 (cloud session on the phone)._

**Status:**
- The site is live. Since Nov 8 the daily run should land around 6am Toronto (crons moved 2 hours earlier on Nov 7).
- Nothing is half-built, and the dev branch matches `main`.
- The next-big-thing fixes shipped Nov 7:
  - a 1,500-capacity room cap
  - taste evidence required
  - specific tags only, needing 2+ of them, capped at 0.3
  - +0.05 for SF rooms
- **Result:** 6 picks instead of 15, and honest ones. 2 of the 6 (OTNES, Raine Maida) came in on indie rock, indie pop and singer-songwriter alone. That's expected until rarity weighting (#11).
- **Shipped since:**
  - **Title splitting (#10, closed).** "X w/ Y & Z" titles now split into acts. It added Mad Iris and Hockey Academy, both at Lee's Palace on Nov 20; next big thing is at 8.
  - **Listen links go to the artist's own page.** From MusicBrainz (`nbt/links.py`): Bandcamp, then SoundCloud, then the old search; YouTube goes to the channel. On Nov 10, 19 of 23 picks linked to a real page.

## Decisions waiting on the user

| When | Decision | Where |
|---|---|---|
| ~Nov 14 | Scoring tune-up: rarity-weighted tags (replaces `GENERIC_TAGS`), the "you'd probably like" bar (only ~7 picks now, so maybe leave it) and ceiling, re-anchoring the 1–10 scale, the velocity check. Momentum in order: weekly research refresh, then side projects (rule decided: include them when the user knows the parent band, as with Mike D of the Beastie Boys; not when they don't, as with Raine Maida of Our Lady Peace), then the boost. | #11 |
| Later | Should Follow feed taste lightly (e.g. a 0.25 seed)? The user chose a pure watchlist for now, Nov 10; revisit, since Bandcamp sampling doesn't scrobble. Watchlist alerts ("they're back in town") are still to build. | #5 |
| Hypothetical | A public version for any Last.fm user: username + location (+ optional setlist.fm), automatic cleanup with a preview, room sizes inferred from bookings, a simpler front-end. **Talk to the user before building the front-end or #5.** | #7 |
| ~mid-Dec | Ledger redesign around "Was I early, and did I go?" | #12 |

Already decided, don't re-ask:
- **Known = 3+ days played, everywhere.** 1–2 days counts as unknown on every tab; the Your rooms "Heard before" bonus is gone. A band seen live but played on fewer than 3 days counts for nothing.
- "Similar to" lists its three bands by similarity, highest first. That stays even if scores are ever hidden.
- Keep the routes that bring in Doja Cat and Little River Band.
- Don't add old favourites (Joshua Radin, Hunter Parrish) or Florence + the Machine to `loves.txt`. Leave out the keeps for Hunter Parrish, Julie Andrews, Selena Gomez and Central Park Cast. The kids' tag filter excludes Selena Gomez ("disney"), and the user knows.
- The raw score stays off the cards; the 1–10 number is the sanity check.
- **Listen links never go to Spotify:** the user's Spotify scrobbles to Last.fm, and sampling a band would make it known. Bandcamp first.
- **No guessed SoundCloud addresses:** they're often unguessable (OTNES is `mxotnes`). SoundCloud's API needs a key it doesn't hand out, and scraping is against its terms. Unlisted bands keep the search link. A file of addresses the user has confirmed by hand is possible later, if the fallback bites.
- **Public version (#7):** one engine with two front-ends in one repo, not a fork. Inputs are a Last.fm username and a location, plus an optional setlist.fm username (not Songkick or Bandsintown). Cleanup is offered as sign-up checkboxes backed by tags plus patterns, with a preview.

## Check next session

0. **Follow / Hide shipped Nov 10.** Has the user pasted the GitHub key on the phone's home-screen app and the Mac (Yours → Saving)? Until a device has it, that device's old votes aren't in the shared file. `data/yours/quepol.json` appearing on `main` means the first save worked.

1. **Next big thing count.** Expect about 4–8 picks a day. Zero, or back to 15, means something broke.
2. **Run time.** The first runs after the cron move should land around 6am Toronto. The evening before means GitHub's delay shrank; 8am or later means it grew again.
3. **Kids and white noise.** The user keeps finding more and edits `exclude.txt` directly. If a new kids' or sleep-playlist name turns up in the picks or the seeds, flag it. Sleep-playlist names look like 2022 first plays, ~1 play a day, generic ambient names.
4. **1–10 ceilings:** no decision needed from the user; bring numbers to #11. Watch for Bands you know saturating at 10 (anything over 50 days), and for velocity pushing next big thing past 10.
5. **Listen links.** The run log's `listen links: N of M` line should stay at roughly 75–85%. Wolf Parade got none on Nov 10 although MusicBrainz has their Bandcamp; probably a refused request that isn't cached, so it should fill in on the next run. If it doesn't, check `nbt/links.py`.
6. **Bad title splits.** Glance at new split lineups for fragments that aren't bands. A fragment named like a band the user knows would wrongly show up in Bands you know ("Dancing with the Stars" → Stars was the near miss).

## Dates to watch

- **~Nov 13–14:** next big thing velocity switches on (28 days of listener snapshots). Check the first growth-scored picks and whether the 1–10 ceiling for next big thing needs raising (velocity adds up to +0.3). This is when to do #11.
- **~mid-Dec:** the ledger's "too soon to tell" window ends, so the redesign (#12) has data to work with.

## Background, low priority

- Research data (SF overlap, The Climb) is an Oct 18 snapshot until a weekly refresh exists (#11, the first momentum step).
- One Node 20 warning remains, from `upload-pages-artifact`.
- **One-off Last.fm or MusicBrainz questions:** a probe workflow on the dev branch answers them in about a minute, since the sandbox can't reach either site. See commit 5114d0c (Last.fm tags) or 3c14380 (MusicBrainz links) for `scripts/lastfm_probe.py` plus `.github/workflows/lastfm-probe.yml`. Delete it afterwards.

## Active issues

- **#11:** scoring tune-up, tags, side projects and momentum, ~Nov 14.
- **#12:** ledger redesign, mid-December (needs #5 first).
- **#5:** follows, the watchlist and alerts; moving votes and follows out of the browser.
- **#7:** bigger feature ideas: email digest, a musicals tier, DICE/box-office rooms, and the plan for a public version (talk first).
