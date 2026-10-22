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
  - The data pipeline runs daily at about 6am Toronto: cron `17 5 * * *`, set ~5 hours early because GitHub starts it late. A backup cron (`47 9 * * *`, ~10:30am in practice) skips itself if today's digest is already on `main`.
- **Pipeline or scoring changes** (`nbt/`, and the score scale in `site/ladder.js`) change what shows up in the picks. Propose them first and get the user's OK.
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
- Every pick explains itself ("similar to X (0.62)"), and **the 1–10 score and similarity weights stay visible**. The user uses them as a sanity check. Each tab's raw score maps onto 1–10 (`SCALES` in `site/ladder.js`): 8.0+ is Strong, 5.0+ Good, 3.0+ Worth a look, below that Long shot (no filled pips), on every tab. Since 2026-10-22 the raw score shows only in the badge's tooltip.
- 👍/👎 votes are stored in the browser only for now (#3).
- **Out-of-town alerts:** `loved` is the top 200 artists by days played (`loved_top_n`) plus every setlist.fm-attended artist. The user wants it narrowed toward their top ~50 seeds once they've used the site for a few weeks (#3). Leave it until then.
- **Following:** following a band is a watchlist, not a love, and doesn't feed taste. Followed rooms filter and sort; they never add to a score (#5).
- **Momentum** (moving up the venue ladder) may boost next big thing and add a timing chip to "you'd probably like". It must never create a pick on its own. Taste stays the gate (#4).

## Design rules (detail in `docs/design.md`)

- The palette matches **OpenPublic.cc** (quepol/OpenPublic). Colours are tokens at the top of `site/style.css`, in light and dark. Body text is Inter; the title is Momo Trust Display, self-hosted.
- **Contrast split:** `--accent-fill` `#FF1493` is for marks only (dots, edges, underlines, focus rings). Small pink text uses `--accent` (`#cc0077` in light, softer in dark), because `#FF1493` fails AA on white. Meet WCAG AA in both themes.
- **Keep pink rare,** so it means something: strength marks, Strong picks, "Tonight", out-of-town, Tickets links. Fact chips are neutral grey; the user tried pink fact chips and a Tickets pill and dropped both. The exception is pink pills (`.chips li.hot`) for a pick's tier (Next big thing, You'd probably like, Bands you know, on every card) and "Moving up". They mean "this is a pick", so they stay.
- **Phone first,** with no sideways scrolling at 390px. Charts need labels a phone can read; the unlabelled Climb chart was replaced by a list for that reason.
- Every page shares the saved theme (`nbt.theme`). All `localStorage` access is wrapped in try/catch.

## Taste rules (from the history checks; detail in `docs/history-checks.md`)

- Seeds: known artists weighted by log of listening depth, √(distinct days × plays), times recency, with `data/loves.txt` loves first. Depth ranks an artist played album-deep (The Civil Wars, 24 days, 110 plays) above one song on shuffle (Gary Jules, 26 days, 26 plays). Old favourites with no recent plays can fall out of the 300 seeds (Joshua Radin, Hunter Parrish); add any that still matter to `loves.txt`, which skips recency. setlist.fm-attended artists not already known are added as seeds at weight 0.4.
- Affinity comes from three sources: forward (the candidate is in a seed's similar-artist list), reverse (a known artist is in the candidate's list), and tags (cosine similarity to the user's tag profile, capped at 0.6, as the fallback for tiny artists).
- "Heard once" artists (1–2 days) count as unknown for next big thing; the pick says "you played them on 1 day back in 2019".
- **Kids' exclusion is automatic:** `exclusions.effective()` drops known artists with kids' or kid-franchise tags (ULTRAKILL, Deltarune, FNAF, Roblox, Vocaloid…). `data/exclude.txt` handles what tags miss; a `+` line keeps an artist. Orchestral game scores are the user's own (`+ Ludvig Forssell`, `+ Jamie Christopherson`). Generic game tags are flagged for review only.
- Confirmed keeps (`+` lines): Ludvig Forssell, Jamie Christopherson, Bad Bunny. On 2026-10-21 the user removed the keeps for Hunter Parrish, Julie Andrews, Selena Gomez and Central Park Cast, knowing the kids' tag filter may now exclude them. Excluded on purpose: Alan Menken.

## Architecture

- `nbt/pipeline.py` `run()`: syncs Last.fm history → exclusions → setlist.fm attended → `Taste` → Ticketmaster events → `score_events()` (picks) and `calendar()` (every upcoming Toronto show, per-act affinity, for the room view) → ledger and snapshots → `site/data/digest.json`.
- `nbt/scoring.py`: tiers, the next-big-thing score `affinity × (0.6 + 0.4 × smallness) + bill_bonus + venue_bonus (+ velocity once 4+ weeks of snapshots)`, `calendar()`.
- `nbt/taste.py`: seeds, affinity, `is_noise`. `nbt/exclusions.py`: kids and game rules, loves.
- `nbt/sources/`:
  - `ticketmaster.py`: **the only event feed**, including TicketWeb, queried for every region (Hamilton and Buffalo too; scoring keeps only loved bands there). It holds a capacity table keyed by Ticketmaster venue ID.
  - `setlistfm.py`: attended shows.
  - Bandsintown was removed (2026-10-19): its city feed got 403 and its app ID 401. Out-of-town shows had silently depended on it.
- `data/`:
  - Committed: `history.json`, `exclude.txt`, `loves.txt`, `ledger.json`, `snapshots/` (daily events, with lineups headliner-first, and listener counts).
  - Not committed: `cache/` (kept in the CI cache).
- `site/`: static, vanilla JS.
  - `index.html` + `app.js`: the picks, in five tabs: **Soon** (picks from all three tiers playing tonight or tomorrow, tonight first, then by 1–10 score), the three tiers, and **Your rooms** (shows at followed rooms, same cards and sort).
  - `venues.html` + `venues.js`: the "SF overlap" research page (raw tables, with sticky section links).
  - `explore.html` + `explore.js`: **Backstage**, the data behind the picks (was Explore; the file name stays). Tabs: The Climb (default), Rivers, Ledger, Attended.
  - `ladder.js`: shared helpers (`el`, `norm`, `localDay()` for local dates), the 1–10 score scale (`SCALES`, `strengthOf()`), and the billing and ladder rules, used by every page.
  - `rooms.js`: followed rooms (`nbt.rooms`) and the show score (`WEIGHTS`), used by the picks page; Backstage uses its calendar helpers.
  - `foot.js`: the shared footer on every page (Picks/Backstage links, Refresh and auto-refresh, theme switch).
  - D3 7.9.0 is self-hosted in `site/vendor/`. Design detail is in `docs/design.md`.
- `research/`: one-off setlist.fm studies, each run by its own workflow on pushes to the dev branch. See `docs/research.md`.
- Tests: `python -m pytest -q`; 36 pass.

## Gotchas that have bitten us

- **The sandbox can't reach** Last.fm, setlist.fm, Bandsintown, Wikipedia or CDNs. Anything needing them runs as a GitHub Actions workflow; read its output through the GitHub tools or from the commit it pushes.
- **A cloud session can't start workflows by hand** (`workflow_dispatch` returns 403). Push a real change to a path the workflow watches, or ask the user to click Run workflow.
- **GitHub starts the daily cron late,** by about 5 hours in Oct 2026 (10:17 UTC scheduled, around 15:00 actual), and skipped it entirely on 2026-10-19. Hence the crons set early and the backup. If runs start landing in the middle of the night, the delay has shrunk; move them back.
- **Local UI testing:** run `python3 -m http.server 8767 --directory site` (in a cloud session, run it as a background task; `setsid nohup … &` servers die between turns), then Playwright with Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Never `pkill -f http.server`; it kills its own shell.
- **setlist.fm allows about 1,440 calls a day.** Research jobs cache responses and never overwrite good results with a partial run Each research workflow triggers only on its own script, so editing one study doesn't run another.
- **Tests run on `main` only,** and only for changes to `nbt/`, `tests/` or `requirements.txt`. Run `python -m pytest -q` locally before every push.
- **Changing an `actions/cache` step's `path` changes the cache version.** The old cache silently stops restoring. Give new files their own cache step.
- **Typographic quotes** ("Arm’s Length") make Last.fm return near-empty pages. `nbt/lastfm.py` looks names up with straight quotes (`lastfm_name()`), and names with quotes use a `q:` cache key so answers cached before the fix aren't reused.
- **Stylised names** ("half•alive") have the same problem: the plain spelling lands on a near-empty page, so an established band looks like a next big thing. Artists under 20K listeners also get an `artist.search`; a same-name match (punctuation aside) with 10× the listeners wins (`_stylised_match()` in `nbt/lastfm.py`).
- **Dates:** a bare `YYYY-MM-DD` string parses as UTC midnight and shows the day before in Toronto. Build local dates from their parts.
- **`parseReasons()` in `site/app.js`** parses the pipeline's reason strings with regexes. Changing reason wording in `nbt/scoring.py` means updating those regexes.
- **`site/data/digest.json` must stay committed.** Deploy-only runs publish whatever copy is on `main`.

## Environment

- Secrets (GitHub, and `.env` locally): `LASTFM_API_KEY`, `TICKETMASTER_API_KEY`, `SETLISTFM_API_KEY`. There is no Bandsintown secret.
- GitHub repository variables (optional): `LASTFM_USER`, `SETLISTFM_USER`. Unset means the defaults in `nbt/config.py` (`quepol`). The README's "Make your own" steps rely on them.
- GitHub secrets can't be read back, so a cloud session can't run the pipeline locally; use the workflows.
