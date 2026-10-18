# Handoff notes

Context for a new Claude Code session that picks this project up. Read this and `README.md` first, then `nbt/` (about 1,200 lines in total).

## The person and how they work

- They're the product owner and guide; Claude builds. They pick the stack only when they want to and expect a recommendation, not a list of options.
- Their stated preferences: no sugar-coating, push back on their thinking, connect dots they might have missed, and act like a sharp chief of staff.
- Last.fm user `quepol`, with about 20 years of scrobbles. They live in **Toronto** and will travel to **Hamilton or Buffalo** only for bands they love.
- They love musicals. Cast recordings and musical theatre are part of their taste, not kids' noise. Touring musicals via Ticketmaster's "Arts & Theatre" classification is a possible future tier (Mirvish and others).

## What we're building

A daily digest of upcoming shows, scored against their listening history, in three tiers:

1. **Know**: an artist they've played on **3 or more distinct days, ever**. There's no recency weighting; they asked for that explicitly.
2. **Would like**: an unknown artist that's close to their taste.
3. **Next big thing**: a small artist (≤100k Last.fm listeners) close to their taste. **This tier is the MVP priority.**

The motivation for the next-big-thing tier is the "Northampton feeling": catching a future-big artist in an intimate room before they blow up (think Radiohead or Jeff Buckley at a 700-cap college-town venue in the late 90s). **Venue size matters here** — a 50k-listener artist headlining the Horseshoe Tavern (400 cap) is a better pick than the same artist opening at Massey Hall (2,765 cap). This is implemented as a soft venue-size bonus (up to +0.15) in the NBT score, not a hard cap.

**NBT listener threshold is 100K** (raised from 50K on 2026-10-17 after reviewing the ledger). Radiohead in 1995 at a 700-cap room would have been well over 50K listeners if Last.fm existed. The `smallness` score falls to 0 at the ceiling, so a 99K-listener artist still ranks below a 5K one — the threshold determines eligibility, not ranking. 200K remains an option if the tier still feels thin after a few weeks.

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

  Seed weight is log(distinct days). Attended artists (from setlist.fm) not already in known are injected as seeds at weight 0.4.
- **"Heard once" artists** (1–2 days played) count as unknown for next-big-thing, and the pick says "you played them on 1 day back in 2019". The user confirmed this.
- **Yo-Yo Ma is both kids' sleep music and the user's own taste**, so keep him as a seed. Distinct days already discounts the 2,086 plays to 114 days.
- **"You'd probably like" includes artists the user has heard of but doesn't play** (it's for broadening their listening). So there's no listener cap on that tier; only Next Big Thing is capped at 50k. **The would_like tier needs tuning** — well-known artists (Olivia Rodrigo, Collective Soul) currently appear because the user doesn't scrobble them but they score on affinity. For now, 👎 is the stopgap. A soft upper cap (~1M listeners) is the right permanent fix.
- **Kids share the Last.fm account.** `data/exclude.txt` removes artists *everywhere*. `summary` auto-flags children's/kids/Disney-tagged artists among the top seeds. **Backlog:** make 👎 write to `data/exclude.txt`.
- **The bragging-rights ledger** (`data/ledger.json`) records each next-big-thing artist's listener count on the day it was first flagged. A separate **attended ledger** (in `digest.json`, rendered on the "Attended" tab) shows every setlist.fm-logged show with current listener counts — the retroactive version of the same idea.

## Event source: Ticketmaster only

Bandsintown's city feed is **permanently blocked by Cloudflare** from any server or CI IP. All request approaches (plain curl, mobile UA, JSON accept header) return 403. The Bandsintown REST API (`rest.bandsintown.com`) requires a `BANDSINTOWN_APP_ID` that is no longer freely issued. A 2026-10-18 probe (`research/bandsintown_probe.py`, results in `research/bandsintown_probe.json`) confirmed the stored `BANDSINTOWN_APP_ID` gets HTTP 401 on artist past-events too, so Bandsintown is out for history and billing. Billing going forward comes from Ticketmaster: daily event snapshots keep lineup order, headliner first (154 of 526 events on 2026-10-18 list more than one act).

**Ticketmaster Discovery API** (`app.ticketmaster.com/discovery/v2/events`) is the city feed. It has a free key (`TICKETMASTER_API_KEY` secret), supports lat/long radius search with `classificationName=music`, and includes TicketWeb (used by most small Toronto clubs). Coverage check result: 557 events in the Toronto region for the next 90 days, ~28% with opener data in `_embedded.attractions`, and all four small-venue spot-checks (Lee's Palace, Horseshoe, Baby G, Monarch Tavern) were present with correct lineups.

Gaps: DICE, Eventbrite, and venues' own box offices are not covered. The Baby G had only 2 events (likely sells through its own site). These are acceptable for now.

The `nbt/sources/ticketmaster.py` module includes a 50-venue capacity lookup table (keyed by TM venue ID) used to compute `venue_bonus`.

## setlist.fm integration

`nbt/sources/setlistfm.py` fetches all attended setlists (111 total, 6 pages) for user `quepol`. 7-day cache; 1s between pages; 3× retry on 429s.

Three uses:
1. **Attended artists as seeds** — 11 artists seen live but with <3 scrobble-days (Billy Corgan, Iron Maiden, PJ Harvey, John Cameron Mitchell, etc.) are injected into the taste graph at seed weight 0.4. Uncontaminated by kids' listening.
2. **Attended artists as loved** — merged into the `loved` set, so they trigger Hamilton/Buffalo alerts and bill_bonus.
3. **Venue novelty** — picks at venues the user has never attended get a "you've never been to X" reason. Matching is fuzzy: TM adds "The " prefixes and city suffixes ("The Danforth Music Hall", "History Toronto"); setlist.fm uses shorter names ("Danforth Music Hall", "History"). The `_venue_attended()` helper in `scoring.py` handles this with substring containment on the core name.

The **attended ledger** is included in `digest.json` and rendered on a dedicated "Attended" tab: every logged show (back to 1991) with current listener counts.

## Current state

- **`main` is live.** The daily workflow runs at 6am Toronto time (UTC-4 in summer, UTC-5 in winter — cron is `17 10 * * *`, which is ~6am EDT).
- **Site changes deploy on their own.** A push to `main` that touches `site/**` runs the same `daily.yml` in deploy-only mode: it skips the pipeline and publishes `site/` with the digest already committed. Both modes share the `pages` concurrency group, so they queue instead of overlapping. The daily run rebases onto `main` before pushing its snapshot commit, so a push made during the run can't get it rejected and the deploy carries the newest UI. Deploy-only runs depend on `site/data/digest.json` being committed to `main`, so keep it tracked.
- All 32 tests pass (`python -m pytest -q`).
- Working:
  - Last.fm client with caching and rate limiting
  - Resumable history backfill
  - Taste model, scoring, ledger, snapshots
  - Static site with real digest data. **Cards were redesigned (2026-10-17):**
    - a date tile
    - a strength badge: 3 pips, a label (Strong / Good / Worth a look) and the raw score, which the user wants kept visible. The thresholds are set per tab in `STRENGTH` in `site/app.js`.
    - an accent edge on Strong picks
    - fact chips parsed from the reason strings by `parseReasons()`. Unknown reasons fall back to plain text. **If reason wording changes in `nbt/scoring.py`, update the regexes there.**
    - similarity weights kept (the user uses them as a sanity check)
    - lineup role ("opening for X")
    - theme-aware SVG listen and vote icons. The listen links are a SoundCloud search (`soundcloud.com/search?q=<artist>`) and a YouTube search. SoundCloud replaced the Last.fm link because the user found Last.fm poor for actually playing music; all scoring data still comes from Last.fm. The SoundCloud link uses a generic music-note icon (`ICONS.music`), not a SoundCloud logo; the user prefers the plain "hear their music" signal.
    - down-voted cards collapse, with an Undo
    - a sort control (Best match / Soonest / Venue / Artist)
    - on phones, the tab row scrolls sideways. A fade with a pink ‹ / › arrow marks whichever edge has more tabs (`.tabs-wrap.more-left/.more-right`, toggled by `updateTabEdges()` in `app.js`), and the selected tab is scrolled into view, including a remembered off-screen tab on load. The arrows are hints only, not buttons.
    - a theme switch in the header: a small segmented control with Light / Dark / System icons (the user liked setlist.fm's footer switch). It's an ARIA radiogroup, and the arrow keys move between options.
    - **the palette and fonts match OpenPublic.cc** (the user's other site, repo quepol/OpenPublic), set as tokens at the top of `site/style.css`:
      - Pink `#FF1493` is `--accent-fill`, used for non-text marks: pips, the strong edge, the tab underline and focus rings.
      - In light mode, small pink text uses `--accent: #cc0077`, because `#FF1493` is only 3.6:1 on white, which fails AA. Keep that split.
      - OpenPublic has no dark mode, so dark here follows its black footer: a black page with lifted cards (`#1e1a1c`, a hint of pink), date tiles and the score badge on the same hue (`#3c3237`), pink-tinted borders (`#3a3236`), neutral grey fact chips (`#3a3a3a`; the user tried pink chips and preferred grey), off-white text (`#ededed`, not pure white), grey text `#b0b0b0` and a lighter pink for text (`#ff7ab8`). The user found pure white on near-black cards hard on the eyes.
      - Pink is kept rare: the strength dots, the Strong edge, "Tonight" and out-of-town regions. The Strong label is plain text. Tickets is a pink text link (`--ticket-text`: `#cc0077` in light, `#ff5cad` in dark, a little stronger than the `#ff7ab8` used for other dark-mode pink text). The user tried a pill and dropped it because it pulled too much focus.
      - In light mode the page is off-white (`#fafafa`) so the white cards lift off it, mirroring dark mode's lighter cards on black.
      - In light mode, date tiles and the score badge are pale pink (`#ffe9f4`), fact chips are neutral grey (`#f0f0f0`, matching dark mode's grey chips), and highlighted chips stay pink (`#ffdcee`), so a pink chip means something. The user asked for these tiles to stand out more in both themes.
      - Empty pips are rings, so filled vs empty differs by shape, not just colour.
      - Body text is Inter (Google Fonts).
      - The title is Momo Trust Display, self-hosted in `site/fonts/` (Fontsource 5.3.0, OFL licence alongside). It isn't on Google Fonts and only has weight 400.

    Refresh: the user runs the site as a home-screen app, which resumes the old page and has no reload control. A footer shows "Loaded <time> · Refresh"; Refresh reloads with a throwaway `?r=` query, which is then stripped from the address. Reopening the app more than an hour after load reloads it automatically (`visibilitychange` / `pageshow`, `STALE_MS` in `app.js`). The digest fetch was already `no-store`.

    Dates: setlist.fm dates (`DD-MM-YYYY`) are built as local dates in `renderAttended`. Parsing a bare `YYYY-MM-DD` string reads it as UTC midnight, which showed every attended show a day early in Toronto (fixed 2026-10-18). Event `starts_at` values carry a time with no zone, so they already parse as local.

    Explore page: `site/explore.html` + `explore.js`, linked both ways with the venue page. The user asked for an exploratory view: phone first, desktop can be better, and a guess-the-band game is deliberately left out. Sections:
    - The Climb (the main feature): each band's best headline room so far as a staircase over time, on a log room-size scale with Monarch, Lee's, Danforth and Massey as rungs. On phones time runs down the page. Filters: moving up, under 250k listeners, bands you've seen, everyone; and SF room. Time is aligned from each band's first headline show by default, with the aughts bands from `data/ladder_study.json` drawn as dashed ghost lines for pace once that study lands.
    - Band lookup, which also uses the attended ledger.
    - Room rivers: SF → Toronto streams; widths are raw counts.
    D3 7.9.0 is self-hosted in `site/vendor/` (ISC licence alongside). Billing and ladder rules shared by both pages live in `site/ladder.js`.

    Research page: `site/venues.html` + `venues.js` (issue #4) render `data/venue_research.json`, written by `research/venue_overlap.py` via `.github/workflows/venue-research.yml` (runs on a push to `research/**` on the dev branch; resumable through an API cache). Toronto capacities for that page are in `data/toronto_capacity.json`, keyed by lowercased setlist.fm venue name. Not linked from the main page. It also has a "Coming back to Toronto" list: shared artists with 2+ Toronto visits (30+ days apart). Last.fm listeners are looked up with typographic quotes normalised, because "Arm’s Length" otherwise matches a near-empty page. Counts under 3,000 are flagged as a possible wrong match. Headline vs support is an assumption from room size, not data (setlist.fm has no billing), following the user's rule: Massey Hall size (2,765) or smaller counts as headlining; bigger rooms and labelled spaces (Arena, Festival, Outdoor) count as support slots, shown greyed with a "support" tag and left off the ladder. "Moving up" is computed on the page from headline shows only. The user frequented these SF rooms; they weren't chosen as a taste test, so no control-room comparison is planned.

    Preferences are saved in `localStorage` under `nbt.sort` and `nbt.theme`; votes keep the same `nbt.votes` format.
  - Daily workflow (runs + deploys Pages), plus deploy-only runs on `site/**` pushes
  - `python -m nbt summary` (taste-model sanity check)
  - Ticketmaster city feed with venue-capacity bonus
  - setlist.fm integration: attended seeds, venue novelty, attended ledger
- **Not working / backlog:**
  - NBT listener threshold raised to 100K; revisit if tier still feels thin
  - `would_like` tier tuning (soft upper listener cap ~1M)
  - 👎 → `data/exclude.txt` (votes currently browser-only)
  - Velocity signal needs 4 weeks of listener snapshots before it's trusted
  - Site: tune the per-tab strength thresholds (`STRENGTH` in `site/app.js`) once there are more digests; the artist-path ("chain") explanation idea from issue #2

## Environment

- `LASTFM_API_KEY` — GitHub secret + needed locally
- `TICKETMASTER_API_KEY` — GitHub secret + needed locally
- `SETLISTFM_API_KEY` — GitHub secret + needed locally
- All three are in `.env` locally (not committed; in `.gitignore`)
- `data/history.json` is committed; `data/cache/` is CI-cached, not committed

## Next steps, in order

1. ~~**Coverage check.**~~ Done. Ticketmaster wins; Bandsintown is blocked.
2. ~~**Implement `city_events()`.**~~ Done. Ticketmaster, 557 events, 26 tests passing.
3. ~~**Individual venue scrapers.**~~ Skipped; TM coverage is sufficient.
4. ~~**Merge.**~~ Done 2026-10-17. Pages live.
5. ~~**setlist.fm (user `quepol`).**~~ Done 2026-10-17. Attended seeds, venue novelty, attended ledger. 32 tests passing.
6. **Later:** NBT listener threshold (try 200K), `would_like` upper listener cap (~1M), sync 👍/👎 back to the pipeline, email digest, curator signals (KEXP, Tiny Desk, labels they trust), velocity signal once there are 4+ weeks of snapshots.

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
