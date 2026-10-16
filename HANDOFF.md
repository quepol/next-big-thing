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
- **"Heard once" artists** (1–2 days played) still count as unknown for next-big-thing, and the pick says "you played them on 1 day back in 2019". The user hasn't confirmed this yet; ask them.
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
4. Get the user's decision on the PR, then merge to `main`, switch Pages to Actions, and run Daily digest.
5. Later: sync 👍/👎 back to the pipeline, the email digest, curator signals (KEXP, Tiny Desk, labels they trust), and the velocity signal once there are 4 or more weeks of snapshots.

## History check results

_Pending: the first run was in progress when this note was written. Run #1: https://github.com/quepol/next-big-thing/actions/runs/38852351628._
