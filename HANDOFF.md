# Handoff notes

Context for a new Claude Code session that picks this project up. Read this and `README.md` first, then `nbt/` (about 900 lines in total).

## The person and how they work

- They're the product owner and guide; Claude builds. They pick the stack only when they want to and expect a recommendation, not a list of options.
- Their stated preferences: no sugar-coating, push back on their thinking, connect dots they might have missed, and act like a sharp chief of staff.
- Last.fm user `quepol`, with about 20 years of scrobbles. They live in **Toronto** and will travel to **Hamilton or Buffalo** only for bands they love.

## What we're building

A daily digest of upcoming shows, scored against their listening history, in three tiers:

1. **Know**: an artist they've played on **3 or more distinct days, ever**. There's no recency weighting; they asked for that explicitly.
2. **Would like**: an unknown artist that's close to their taste.
3. **Next big thing**: a small artist (≤50k Last.fm listeners) close to their taste. **This tier is the MVP priority, and the motivation is bragging rights** ("I saw them in a 200-capacity room before they blew up"). They're explicitly interested in *tiny venues they don't usually go to*, so we use a city-wide feed rather than a list of venues.

Other decisions they've made:
- The output is a digest page; email is optional later. "This show exists" is enough, so on-sale timing isn't needed.
- 👍/👎 feedback: yes, as long as it's low-friction. Votes are only stored in the browser for now.
- Every pick explains itself, especially with "similar to X".
- It's for them only. Scraping is acceptable.
- Hosting: GitHub Pages, fed by a daily GitHub Actions job. The accumulating data (listener snapshots, event snapshots, ledger) is a deliberate byproduct, kept for backtesting.

## Design calls Claude made (open to challenge)

- **Next-big-thing score:** affinity × (0.6 + 0.4 × smallness). A shared bill with a known artist adds +0.15. Listener growth adds up to +0.3, but only once there are 4 or more weeks of snapshots, because Last.fm has no listener history and we have to build it.
- **Affinity has three sources:**
  - forward: the candidate is in one of the user's seed artists' similar-artist lists
  - reverse: one of the user's known artists is in the candidate's similar-artist list
  - tags: cosine similarity to their tag profile, capped at 0.6. This is the fallback for tiny artists, who have no similarity data.

  Seed weight is log(distinct days).
- **"Heard once" artists** (1–2 days played) count as unknown for next-big-thing, and the pick says "you played them on 1 day back in 2019". The user confirmed this.
- **Yo-Yo Ma is both kids' sleep music and the user's own taste**, so keep him as a seed. Distinct days already discounts the 2,086 plays to 114 days.
- **"You'd probably like" includes artists the user has heard of but doesn't play** (it's for broadening their listening). So there's no listener cap on that tier; only Next Big Thing is capped at 50k.
- **Kids share the Last.fm account.** This is the main reason for "never show me this band". Kids replay favourites on many distinct days, so without exclusions they'd dominate the seeds and the tag profile. `data/exclude.txt` removes artists *everywhere* (known, loved, seeds, tag profile, picks). `summary` auto-flags children's/kids/Disney-tagged artists among the top seeds. Teen pop won't carry those tags, so it needs 👎. **Backlog:** make 👎 write to `data/exclude.txt`; votes currently live only in the browser. The user hasn't said whether family shows are worth a separate tier; they're excluded for now.
- **The bragging-rights ledger** (`data/ledger.json`) records each next-big-thing artist's listener count on the day it was first flagged. Over time it shows "flagged at 3.1k, now at 410k", and it's the label set for backtesting.

## Current state

- Branch `claude/music-venue-alerts-ayb8hs`, pushed. **It hasn't been merged to `main`, and there's no PR.** Don't open one unless the user asks.
- All 11 tests pass (`python -m pytest -q`), and the Tests workflow is green on the branch.
- Working:
  - Last.fm client with caching and rate limiting
  - Resumable history backfill
  - Taste model, scoring, ledger, snapshots
  - Static site with demo data
  - Daily workflow
  - `python -m nbt summary` (the taste-model sanity check)
- **Not working:** `nbt/sources/bandsintown.py: city_events()` raises `NotImplementedError`. The next-big-thing tier can't produce picks without it. The artist-first path, using the Bandsintown REST API, needs a `BANDSINTOWN_APP_ID`. We don't have one, and it isn't clear whether Bandsintown still issues them freely.

## Environment gotchas

- **Repo `quepol/next-big-thing` is public.** That's acceptable: their Last.fm profile is public anyway. But anything printed to Actions logs or committed is public too.
- The `LASTFM_API_KEY` secret is **only available in GitHub Actions.** A cloud session needs it set as an environment variable to run against Last.fm locally.
- `workflow_dispatch` only works for workflows that exist on `main`. That's why `history-check.yml` also runs on pushes to this branch that touch `nbt/**` or the workflow file. The Daily digest workflow can't run until the branch is merged.
- The previous session's environment **blocked** `www.bandsintown.com`, `rest.bandsintown.com` and `ws.audioscrobbler.com`. The new session should have them allowed; check with `curl` before assuming.
- GitHub Pages is already enabled on the repo, set to branch deploy (`pages-build-deployment`). `daily.yml` deploys with Actions, so Settings → Pages → Source must be switched to "GitHub Actions" before it works.

## Next steps, in order

1. **Coverage check.** This decides whether Bandsintown can be the main source.
   - Pull the Bandsintown Toronto city feed (website or app JSON) for the next 60 days.
   - Count how many events list more than one artist. Openers matter most for the next-big-thing tier.
   - Compare a few small venues' own calendars against it (e.g. the Horseshoe, Lee's Palace, the Baby G, the Monarch Tavern) and estimate what fraction of shows Bandsintown misses.
   - Report the results to the user before building further.
2. **Implement `city_events()`.**
   - It must return `Event`s with `lineup`, `venue.lat`/`lon` and a stable `id`.
   - Add a fixture-based parser test using a saved page sample. **Don't write a parser without seeing real responses.**
   - Watch whether Bandsintown blocks GitHub Actions' IP ranges. If it does, the fallback is running the scrape from the user's own machine or a small VPS.
3. If coverage is poor, add scrapers for individual venue sites behind the same `Event` interface.
4. **Merge only once the city feed produces real shows.** The user agreed to this; they don't want a draft PR before then. Merging earlier would switch on the daily schedule with zero events. It would commit history every day, fail the Pages deploy step (Pages is still set to deploy from a branch), and start the 4-week listener-growth clock with no lineups to snapshot. At merge time:
   1. Open the PR. Ask the user first; they decide.
   2. Merge it.
   3. Switch Settings → Pages → Source to "GitHub Actions".
   4. Run Daily digest once by hand.
   5. Check the page.
5. **setlist.fm (user `quepol`).** This comes after the city feed. It needs the user's free API key (repo secret `SETLISTFM_API_KEY`) and `api.setlist.fm` allowed in the network settings. Uses:
   - Attended artists get a boost as seeds and count as "loved". This signal can't be polluted by the kids' listening.
   - A **retroactive bragging-rights ledger**: compare attended shows with current listener counts. It doubles as a backtest of the next-big-thing score.
   - **Venue novelty**: flag or boost venues the user has never been to.

   The user's history there is thinner than their scrobbles, and openers often aren't logged.
6. Later: sync 👍/👎 back to the pipeline, the email digest, curator signals (KEXP, Tiny Desk, labels they trust), and the velocity signal once there are 4 or more weeks of snapshots.

## History check results (run #1, 2026-10-16)

https://github.com/quepol/next-big-thing/actions/runs/38852351628. The backfill took about 4 minutes and the whole run about 7.

- **History:** 74,485 plays, 6,432 artists, 379 pages, 2005 to now.
  - By days played: 1 day 3,306 · 2 days 1,067 · 3–9 days 1,462 · 10–99 days 570 · 100+ days 27.
  - Known (3 or more days): 2,059.
- **Top seeds look like real taste** (indie folk and singer-songwriter): City and Colour, William Fitzsimmons, Joshua Radin, Radiohead, Hunter Parrish, Iron & Wine, The Weepies, Bon Iver, Elliott Smith… **Yo-Yo Ma** (2,086 plays over 114 days) is an outlier; ask whether it's the kids.
- **Kids' listening leaks into the seeds:** Laurie Berkner and Sandra Boynton showed up as "next big thing" candidates, so kids' artists are among the seeds. That's what `exclude.txt` and the kids flagging are for.
- **Problems found:**
  1. **Affinity saturates.** `1 - exp(-sum)` over many seeds puts nearly every top neighbour at 1.00, so the ranking means nothing at the top.
  2. **Hub and popularity bias.** The top neighbours are 0.3–3M-listener bands (Kasabian, Kaiser Chiefs, Editors) that appear in many seeds' similar-artist lists and that the user almost certainly already knows.
  3. **Alias pages.** `マイケル・ジャクソン` (Michael Jackson in Japanese script, 14k listeners) looked like a small artist. Last.fm keeps separate pages for alternative spellings, and they look small.
  4. Only 6 of the top 400 neighbours have 50k listeners or fewer. Next-big-thing candidates must come from the city feed's lineups (reverse lookups plus tags), not from the forward graph.
- **A good sign:** Deb Talan (half of The Weepies) and Molly Tuttle & Golden Highway are exactly the kind of pick we want: side projects and new projects from artists the user loves.

## History check #3 (after the affinity and alias fixes)

https://github.com/quepol/next-big-thing/actions/runs/38854345175

- Affinity now ranges from 0.71 down to 0.53, and the ranking looks like the user's taste: Iron & Wine and Calexico, Roo Panes, Volcano Choir, Stu Larsen, Old Sea Brigade, Dar Williams, Donovan Woods. **Side projects and collaborations dominate** (Volcano Choir, Divine Fits, Matt Berninger, Monsters of Folk), because Last.fm rates a band and its side project as near-identical. That's useful; just watch that it doesn't crowd out genuinely new artists.
- **Bug found and fixed:** `normalize_name` stripped every non-Latin character, so all Japanese, Korean and Cyrillic names became `""`. They collided in the caches, and any non-Latin artists in the scrobble history were dropped. It now keeps every script and strips accents only from Latin letters. The cache key was bumped to `history-check-v2-` to force a fresh backfill.
- The kids' scan across all known artists flagged 14 more. 12 are excluded. Then the user decided: **Alan Menken = kids** (excluded) and **Selena Gomez = the user's own** (kept).
- **Older kids listen to video-game music:** game soundtracks (Fallout, Bendy, FNAF…) and YouTube musicians like CG5. `GAME_TAGS` flags these for review only, without auto-excluding them; Fallout's soundtrack is 1940s records that could be the user's.
- The small-artist list was still noisy: kids' artists reached through other kids' seeds (Ralph's World, Charlie Hope); junk user-upload pages (`JJerome87`, `NightCove_thefox`); and soundtrack and actor pages (Peggy Wood, Uzo Aduba). More evidence that next-big-thing candidates have to come from real lineups, not from the forward graph.

## History check #5

https://github.com/quepol/next-big-thing/actions/runs/38856513297

- The video-game scan worked. **9 YouTube FNAF, Roblox and Minecraft creators** were excluded (Kyle Allen Music with 34 days, Tryhardninja, and others). **4 game composers or bands are waiting on the user:** Ludvig Forssell, Heaven Pierce Her, Jamie Christopherson, Powerglove. `+ Selena Gomez` in `exclude.txt` stops her being re-flagged.
- **Second normalization bug:** symbol-only names (e.g. "†††", Crosses) still collapsed to `""`. This is why マイケル・ジャクソン showed †††'s similar-artist list in check #3. Fixed: such names fall back to the casefolded raw name. The cache key was bumped to `history-check-v3-`.
- **Kids' leakage persisted** (Sandra Boynton, Laurie Berkner, Ralph's World, Charlie Hope) through a seed that hasn't been identified. Scoring now **refuses unknown artists whose own tags are kids' or video-game tags** (`Taste.is_noise`), and the summary prints reasons on the small-artist list so the bridging seed shows up.
- マイケル・ジャクソン still passed the alias check at 0.41. It hasn't been diagnosed without network access. In practice it doesn't matter, because it will never appear in a Toronto lineup.

