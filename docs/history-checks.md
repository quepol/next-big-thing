# History checks and first runs (archive)

Notes from the October 2026 runs that tuned the taste model and the first live pipeline run. Kept for background; the rules that came out of them are in `CLAUDE.md`.

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

## History check #7: the taste model is considered ready

https://github.com/quepol/next-big-thing/actions/runs/38859298640

- History: 6,442 artists and 74,517 plays. That's 10 artists more than before the normalization fixes; these are the recovered non-Latin and symbol-only names.
- 37 artists excluded: 32 manually, plus 5 automatically by tags (Jakeneutron and Mike Geno for Friday Night Funkin'; Ghost and Pals, CircusP and Flavor Foley for Vocaloid). No game-music artists left to review.
- **The kids' leakage is gone:** no more Sandra Boynton, Laurie Berkner, Ralph's World or Charlie Hope.
- The small-artist list is now mostly real side projects of loved bands: Deb Talan (The Weepies), Ruth Moody (The Wailin' Jennys), Will Sheff (Okkervil River), Tom Chaplin (Keane), Owl John (Frightened Rabbit). It also has classical neighbours of Yo-Yo Ma. The remaining junk comes from junk seeds (`Us`, `Various Musique`, a Dreamgirls cast string) and doesn't matter, because real candidates come from lineups.
- Possible kids or musical-theatre seeds still worth asking about: **Hunter Parrish** (267 days; an actor whose cast recordings include Godspell) and **Julie Andrews** (which brings in Peggy Wood from *The Sound of Music*).
- The user's answers: **Hunter Parrish and Julie Andrews are kept** (`+` lines). **The user loves musicals**, so cast recordings and musical theatre are part of their taste, not kids' noise.
- All three API keys are now GitHub secrets: `LASTFM_API_KEY`, `TICKETMASTER_API_KEY`, `SETLISTFM_API_KEY`. GitHub secrets can't be read back, so a cloud session needs the same values set as environment variables.
