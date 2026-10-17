# Handoff notes

Context for a new Claude Code session that picks this project up. Read this and `README.md` first, then `nbt/` (about 900 lines in total).

## The person and how they work

- They're the product owner and guide; Claude builds. They pick the stack only when they want to and expect a recommendation, not a list of options.
- Their stated preferences: no sugar-coating, push back on their thinking, connect dots they might have missed, and act like a sharp chief of staff.
- Last.fm user `quepol`, with about 20 years of scrobbles. They live in **Toronto** and will travel to **Hamilton or Buffalo** only for bands they love.
- They love musicals. Cast recordings and musical theatre are part of their taste, not kids' noise. Touring musicals via Ticketmaster's "Arts & Theatre" classification is a possible future tier (Mirvish and others).

## What we're building

A daily digest of upcoming shows, scored against their listening history, in three tiers:

1. **Know**: an artist they've played on **3 or more distinct days, ever**. There's no recency weighting; they asked for that explicitly.
2. **Would like**: an unknown artist that's close to their taste.
3. **Next big thing**: a small artist (≤50k Last.fm listeners) close to their taste. **This tier is the MVP priority.**

The motivation for the next-big-thing tier is the "Northampton feeling": catching a future-big artist in an intimate room before they blow up (think Radiohead or Jeff Buckley at a 200-cap college-town venue in the late 90s). **Venue size matters here** — a 50k-listener artist headlining the Horseshoe Tavern (400 cap) is a better pick than the same artist opening at Massey Hall (2,765 cap). This is implemented as a soft venue-size bonus (up to +0.15) in the NBT score, not a hard cap.

For the **know** tier, venue size doesn't cap eligibility — if Iron & Wine is at Massey Hall you want to know. The city-wide feed surfaces all shows regardless of venue.

Other decisions they've made:
- The output is a digest page; email is optional later. "This show exists" is enough, so on-sale timing isn't needed.
- 👍/👎 feedback: yes, as long as it's low-friction. Votes are only stored in the browser for now; syncing them back to the pipeline is backlog.
- Every pick explains itself, especially with "similar to X".
- It's for them only. Scraping is acceptable.
- Hosting: GitHub Pages, fed by a daily GitHub Actions job. The accumulating data (listener snapshots, event snapshots, ledger) is a deliberate byproduct, kept for backtesting.

## Design calls Claude made (open to challenge)

- **Next-big-thing score:** `affinity × (0.6 + 0.4 × smallness) + bill_bonus + venue_bonus`. A shared bill with a known artist adds +0.15. Listener growth adds up to +0.3, but only once there are 4 or more weeks of snapshots. Venue bonus is `0.15 × (1 − capacity / 1500)`, capped at 0 for venues ≥1,500 cap or unknown.
- **Affinity has three sources:**
  - forward: the candidate is in one of the user's seed artists' similar-artist lists
  - reverse: one of the user's known artists is in the candidate's similar-artist list
  - tags: cosine similarity to their tag profile, capped at 0.6. This is the fallback for tiny artists, who have no similarity data.

  Seed weight is log(distinct days).
- **"Heard once" artists** (1–2 days played) count as unknown for next-big-thing, and the pick says "you played them on 1 day back in 2019". The user confirmed this.
- **Yo-Yo Ma is both kids' sleep music and the user's own taste**, so keep him as a seed. Distinct days already discounts the 2,086 plays to 114 days.
- **"You'd probably like" includes artists the user has heard of but doesn't play** (it's for broadening their listening). So there's no listener cap on that tier; only Next Big Thing is capped at 50k. **The would_like tier needs tuning** — well-known artists (Olivia Rodrigo, Collective Soul) currently appear because the user doesn't scrobble them but they score on affinity. For now, 👎 is the stopgap. A soft upper cap (~1M listeners) is the right permanent fix.
- **Kids share the Last.fm account.** `data/exclude.txt` removes artists *everywhere*. `summary` auto-flags children's/kids/Disney-tagged artists among the top seeds. **Backlog:** make 👎 write to `data/exclude.txt`.
- **The bragging-rights ledger** (`data/ledger.json`) records each next-big-thing artist's listener count on the day it was first flagged.

## Event source: Ticketmaster only

Bandsintown's city feed is **permanently blocked by Cloudflare** from any server or CI IP. All request approaches (plain curl, mobile UA, JSON accept header) return 403. The Bandsintown REST API (`rest.bandsintown.com`) requires a `BANDSINTOWN_APP_ID` that is no longer freely issued.

**Ticketmaster Discovery API** (`app.ticketmaster.com/discovery/v2/events`) is the city feed. It has a free key (`TICKETMASTER_API_KEY` secret), supports lat/long radius search with `classificationName=music`, and includes TicketWeb (used by most small Toronto clubs). Coverage check result: 557 events in the Toronto region for the next 90 days, ~28% with opener data in `_embedded.attractions`, and all four small-venue spot-checks (Lee's Palace, Horseshoe, Baby G, Monarch Tavern) were present with correct lineups.

Gaps: DICE, Eventbrite, and venues' own box offices are not covered. The Baby G had only 2 events (likely sells through its own site). These are acceptable for now.

The `nbt/sources/ticketmaster.py` module includes a 50-venue capacity lookup table (keyed by TM venue ID) used to compute `venue_bonus`.

## Current state

- **`main` is live.** Merged and deployed 2026-10-17. The daily workflow runs at 6am Toronto time.
- All 26 tests pass (`python -m pytest -q`).
- Working:
  - Last.fm client with caching and rate limiting
  - Resumable history backfill
  - Taste model, scoring, ledger, snapshots
  - Static site with real digest data
  - Daily workflow (runs + deploys Pages)
  - `python -m nbt summary` (taste-model sanity check)
  - Ticketmaster city feed with venue-capacity bonus
- **Not working / backlog:**
  - `would_like` tier tuning (soft upper listener cap ~1M)
  - 👎 → `data/exclude.txt` (votes currently browser-only)
  - setlist.fm integration (next priority — see step 5 below)
  - Velocity signal needs 4 weeks of listener snapshots before it's trusted

## Environment

- `LASTFM_API_KEY` — GitHub secret + needed locally
- `TICKETMASTER_API_KEY` — GitHub secret + needed locally
- `SETLISTFM_API_KEY` — GitHub secret (set), **not yet used in code**
- All three are in `.env` locally (not committed; in `.gitignore`)
- `data/history.json` is committed; `data/cache/` is CI-cached, not committed

## Next steps, in order

1. ~~**Coverage check.**~~ Done. Ticketmaster wins; Bandsintown is blocked.
2. ~~**Implement `city_events()`.**~~ Done. Ticketmaster, 557 events, 26 tests passing.
3. ~~**Individual venue scrapers.**~~ Skipped; TM coverage is sufficient.
4. ~~**Merge.**~~ Done 2026-10-17. Pages live.
5. **setlist.fm (user `quepol`).** This is the next priority. Key `SETLISTFM_API_KEY` is already a secret; `api.setlist.fm` is already in the network allowlist. Uses:
   - Attended artists get a boost as seeds and count as "loved". This signal can't be polluted by the kids' listening.
   - A **retroactive bragging-rights ledger**: compare attended shows with current listener counts. Doubles as a backtest of the next-big-thing score.
   - **Venue novelty**: flag or boost venues the user has never been to.

   The user's setlist.fm history is thinner than their scrobbles, and openers often aren't logged. Don't write a parser without fetching real responses first.
6. **Later:** sync 👍/👎 back to the pipeline, the email digest, curator signals (KEXP, Tiny Desk, labels they trust), `would_like` upper listener cap, and velocity signal once there are 4+ weeks of snapshots.

## First live Actions run (2026-10-17)

GitHub Actions run `38992090253`. Both jobs green; Pages deployed in 24m 19s (first run — history backfill warm from committed `data/history.json`).

- 557 events in range (Toronto, 90-day window)
- digest: next_big_thing=21, would_like=22, know=18
- Top NBT picks: Dominique Way (11k listeners, Drake Hotel 250 cap), Bradley Hale (380 listeners, Rivoli 200 cap), Twin Fin (17k listeners, Monarch Tavern 250 cap)
- Venue bonus working: small-room picks rank above same artist at large venues
- Node.js 20 deprecation warnings from Actions — harmless, but worth updating action versions eventually

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

## The user's rules for game music (after check #5)

- **Orchestral game scores are the user's own** (e.g. Death Stranding: `+ Ludvig Forssell`; Metal Gear Rising: `+ Jamie Christopherson`).
- **Always the kids':** ULTRAKILL, Deltarune, Undertale, FNAF, Friday Night Funkin', Roblox, Minecraft, Vocaloid, Poppy Playtime, Bendy, gaming YouTubers. These are `KID_FRANCHISE_TAGS`, treated exactly like children's tags.
- Generic game tags (`GAME_TAGS`: video game music, VGM, game soundtrack, fallout) are **review only**. The summary lists them; they aren't excluded.
- **Kids' exclusion is now automatic:** `exclusions.effective()` excludes every known artist carrying kids' or kid-franchise tags, unless it has a `+` keep. `data/exclude.txt` is now only for things tags can't catch. The user also named Don Cooper, Blippi, Justin Roberts, Raffi and Twenty Trucks, plus Heaven Pierce Her (ULTRAKILL) and Powerglove (non-orchestral).

## Onboarding other people later (not in scope now)

The user asked about this.
- **Ticketmaster has no public user-authorised API for purchase history**; the Partner and Commerce APIs are for distribution. The realistic universal route to "shows attended" is **parsing ticket confirmation emails** (a Gmail connection or a forwarding address), which covers Ticketmaster, TicketWeb, DICE, Eventbrite and Universe. setlist.fm covers the few people who log their shows there.
- **Listening sources:** Last.fm (open, but few people scrobble), Spotify (developer-mode limits keep tightening; check the current user caps), and Apple Music (needs a paid Apple developer account; the library and recently-played endpoints are available).

## History check #7: the taste model is considered ready

https://github.com/quepol/next-big-thing/actions/runs/38859298640

- History: 6,442 artists and 74,517 plays. That's 10 artists more than before the normalization fixes; these are the recovered non-Latin and symbol-only names.
- 37 artists excluded: 32 manually, plus 5 automatically by tags (Jakeneutron and Mike Geno for Friday Night Funkin'; Ghost and Pals, CircusP and Flavor Foley for Vocaloid). No game-music artists left to review.
- **The kids' leakage is gone:** no more Sandra Boynton, Laurie Berkner, Ralph's World or Charlie Hope.
- The small-artist list is now mostly real side projects of loved bands: Deb Talan (The Weepies), Ruth Moody (The Wailin' Jennys), Will Sheff (Okkervil River), Tom Chaplin (Keane), Owl John (Frightened Rabbit). It also has classical neighbours of Yo-Yo Ma. The remaining junk comes from junk seeds (`Us`, `Various Musique`, a Dreamgirls cast string) and doesn't matter, because real candidates come from lineups.
- Possible kids or musical-theatre seeds still worth asking about: **Hunter Parrish** (267 days; an actor whose cast recordings include Godspell) and **Julie Andrews** (which brings in Peggy Wood from *The Sound of Music*).
- The user's answers: **Hunter Parrish and Julie Andrews are kept** (`+` lines). **The user loves musicals**, so cast recordings and musical theatre are part of their taste, not kids' noise.
- All three API keys are now GitHub secrets: `LASTFM_API_KEY`, `TICKETMASTER_API_KEY`, `SETLISTFM_API_KEY`. GitHub secrets can't be read back, so a cloud session needs the same values set as environment variables.
