# next-big-thing

A personal tool that alerts the user to Toronto shows, scored against ~20 years of their Last.fm listening. The pipeline is Python in `nbt/`. A daily GitHub Actions job writes `site/data/digest.json`, and a static site in `site/` is served on GitHub Pages: https://quepol.github.io/next-big-thing/

Where things stand right now is in `HANDOFF.md`. The backlog lives in **GitHub Issues** (#3 onward), not in files.

## The person and how to work with them

- The product owner. Claude builds. Give a recommendation, not a menu of options.
- They want no sugar-coating, pushback on their thinking, connected dots and a sharp chief of staff.
- Last.fm user `quepol`; setlist.fm user `quepol`. They live in **Toronto** and travel to **Hamilton or Buffalo** only for bands they love.
- **They love musicals.** Cast recordings and musical theatre are their taste, not kids' noise.
- **Kids share the Last.fm account.** Kids' and kid-franchise artists are excluded (see Taste rules).
- They switch between a Mac and a phone. The site runs as a **home-screen app on the phone**, so design for phones first.

## Working agreement

- **Branch:** develop on `claude/music-venue-alerts-ayb8hs`. No pull requests unless asked.
- **UI work:** render it locally, show the user screenshots (phone and desktop, light and dark), and commit only when they approve.
- **"Ship it"** means: merge `origin/main` into the branch, run `python -m pytest -q`, push the branch, then push to `main` (a fast-forward).
  - A push to `main` that touches `site/**` deploys on its own in about a minute (deploy-only mode of `daily.yml`).
  - The data pipeline runs daily at about 6am Toronto (cron `17 10 * * *`).
- **Pipeline or scoring changes** (`nbt/`, and the thresholds in `site/app.js`) change what shows up in the picks. Propose them first and get the user's OK.
- **Docs:** when a change alters how something works, update `CLAUDE.md` or `docs/` in the same commit. Update `HANDOFF.md` at the end of a working session. Put new ideas in Issues.
- **Billing assumptions must be visible.** When the data doesn't say something (for example who headlined), the page labels it as an assumption ("likely support").

## Product

Three tiers in the daily digest:
1. **Know:** played on 3 or more distinct days, ever. No recency weighting, by request.
2. **You'd probably like:** close to their taste, including artists they've heard of but don't play. No listener cap yet (a soft cap is in #3).
3. **Next big thing (the MVP priority):** at most **100K** Last.fm listeners and close to their taste.
   - The goal is the "Northampton feeling": catching a future-big band in a small room.
   - Room size matters. A soft venue bonus (`0.15 × (1 − cap/1500)`) favours small rooms; it's not a hard cap.

Other product decisions:
- Every pick explains itself ("similar to X (0.62)"), and **the raw score and similarity weights stay visible**. The user uses them as a sanity check.
- 👍/👎 votes are stored in the browser only for now (#3).
- **Out-of-town alerts:** `loved` is the top 200 artists by days played (`loved_top_n`) plus every setlist.fm-attended artist. The user wants it narrowed toward their top ~50 seeds once they've used the site for a few weeks (#3). Leave it until then.
- **Following:** following a band is a watchlist, not a love, and doesn't feed taste. Followed rooms filter and sort; they never add to a score (#5).
- **Momentum** (moving up the venue ladder) may boost next big thing and add a timing chip to "you'd probably like". It must never create a pick on its own. Taste stays the gate (#4).

## Design rules (detail in `docs/design.md`)

- The palette matches **OpenPublic.cc** (quepol/OpenPublic). Colours are tokens at the top of `site/style.css`, in light and dark. Body text is Inter; the title is Momo Trust Display, self-hosted.
- **Contrast split:** `--accent-fill` `#FF1493` is for marks only (dots, edges, underlines, focus rings). Small pink text uses `--accent` (`#cc0077` in light, softer in dark), because `#FF1493` fails AA on white. Meet WCAG AA in both themes.
- **Keep pink rare,** so it means something: strength marks, Strong picks, "Tonight", out-of-town, Tickets links. Fact chips are neutral grey; the user tried pink chips and a Tickets pill and dropped both.
- **Phone first,** with no sideways scrolling at 390px. Charts need labels a phone can read; the unlabelled Climb chart was replaced by a list for that reason.
- Every page shares the saved theme (`nbt.theme`). All `localStorage` access is wrapped in try/catch.

## Taste rules (from the history checks; detail in `docs/history-checks.md`)

- Seeds: known artists weighted by log(distinct days), with `data/loves.txt` loves first. setlist.fm-attended artists not already known are added as seeds at weight 0.4.
- Affinity comes from three sources: forward (the candidate is in a seed's similar-artist list), reverse (a known artist is in the candidate's list), and tags (cosine similarity to the user's tag profile, capped at 0.6, as the fallback for tiny artists).
- "Heard once" artists (1–2 days) count as unknown for next big thing; the pick says "you played them on 1 day back in 2019".
- **Kids' exclusion is automatic:** `exclusions.effective()` drops known artists with kids' or kid-franchise tags (ULTRAKILL, Deltarune, FNAF, Roblox, Vocaloid…). `data/exclude.txt` handles what tags miss; a `+` line keeps an artist. Orchestral game scores are the user's own (`+ Ludvig Forssell`, `+ Jamie Christopherson`). Generic game tags are flagged for review only.
- Kept on purpose: Yo-Yo Ma, Hunter Parrish, Julie Andrews, Selena Gomez. Excluded on purpose: Alan Menken.

## Architecture

- `nbt/pipeline.py` `run()`: syncs Last.fm history → exclusions → setlist.fm attended → `Taste` → Ticketmaster events → `score_events()` (picks) and `calendar()` (every upcoming show, per-act affinity, for the room view) → ledger and snapshots → `site/data/digest.json`.
- `nbt/scoring.py`: tiers, the next-big-thing score `affinity × (0.6 + 0.4 × smallness) + bill_bonus + venue_bonus (+ velocity once 4+ weeks of snapshots)`, `calendar()`.
- `nbt/taste.py`: seeds, affinity, `is_noise`. `nbt/exclusions.py`: kids and game rules, loves.
- `nbt/sources/`:
  - `ticketmaster.py`: **the only event feed**, including TicketWeb. It holds a capacity table keyed by Ticketmaster venue ID.
  - `setlistfm.py`: attended shows.
  - `bandsintown.py`: dead. The city feed gets 403 and the app ID gets 401 (#6).
- `data/`:
  - Committed: `history.json`, `exclude.txt`, `loves.txt`, `ledger.json`, `snapshots/` (daily events, with lineups headliner-first, and listener counts).
  - Not committed: `cache/` (kept in the CI cache).
- `site/`: static, vanilla JS.
  - `index.html` + `app.js`: the picks.
  - `venues.html` + `venues.js`: the "SF overlap" research page (raw tables, with sticky section links).
  - `explore.html` + `explore.js`: Rooms (default) / The Climb tabs.
  - `ladder.js`: billing and ladder rules shared by the venue and explore pages.
  - `foot.js`: the shared footer on every page (Picks/Explore links, Refresh and auto-refresh, theme switch).
  - D3 7.9.0 is self-hosted in `site/vendor/`. Design detail is in `docs/design.md`.
- `research/`: one-off setlist.fm studies, each run by its own workflow on pushes to the dev branch. See `docs/research.md`.
- Tests: `python -m pytest -q`; 33 pass.

## Gotchas that have bitten us

- **The sandbox can't reach** Last.fm, setlist.fm, Bandsintown, Wikipedia or CDNs. Anything needing them runs as a GitHub Actions workflow; read its output through the GitHub tools or from the commit it pushes.
- **A cloud session can't start workflows by hand** (`workflow_dispatch` returns 403). Push a real change to a path the workflow watches, or ask the user to click Run workflow.
- **GitHub starts the daily cron late,** by about 3.5 hours on recent days (10:17 UTC scheduled, around 14:00 actual).
- **Local UI testing:** run `python3 -m http.server 8767 --directory site` (in a cloud session, run it as a background task; `setsid nohup … &` servers die between turns), then Playwright with Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Never `pkill -f http.server`; it kills its own shell.
- **setlist.fm allows about 1,440 calls a day.** Research jobs cache responses and never overwrite good results with a partial run.
- **Changing an `actions/cache` step's `path` changes the cache version.** The old cache silently stops restoring. Give new files their own cache step.
- **Typographic quotes** ("Arm’s Length") make Last.fm return near-empty pages. Normalise names before lookup.
- **Dates:** a bare `YYYY-MM-DD` string parses as UTC midnight and shows the day before in Toronto. Build local dates from their parts.
- **`parseReasons()` in `site/app.js`** parses the pipeline's reason strings with regexes. Changing reason wording in `nbt/scoring.py` means updating those regexes.
- **`site/data/digest.json` must stay committed.** Deploy-only runs publish whatever copy is on `main`.

## Environment

- Secrets (GitHub, and `.env` locally): `LASTFM_API_KEY`, `TICKETMASTER_API_KEY`, `SETLISTFM_API_KEY`. `BANDSINTOWN_APP_ID` exists but is rejected.
- GitHub repository variables (optional): `LASTFM_USER`, `SETLISTFM_USER`. Unset means the defaults in `nbt/config.py` (`quepol`). The README's "Make your own" steps rely on them.
- GitHub secrets can't be read back, so a cloud session can't run the pipeline locally; use the workflows.
