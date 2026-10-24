# Site design (picks page and shared styles)

How the picks page looks and behaves, and why. The rules that matter every session (contrast split, pink kept rare, score visible, phone first) are summarised in `CLAUDE.md`. Backstage and the venue page are in `docs/research.md`.

## Cards (redesigned 2026-10-17)

- a date tile
- a strength badge: 3 pips, a label (Strong / Good / Worth a look) and the score out of 10 with one decimal ("8.2"), which the user wants kept visible as a sanity check.
  - Each tab's raw score is mapped onto 1–10 by `SCALES` in `site/ladder.js`. Four anchors per tab set 1.0, Good (5.0), Strong (8.0) and the 10 ceiling, with straight lines between them. The anchors come from the first 11 digests' score history.
  - On every tab: 8.0+ is Strong (3 pips), 5.0+ Good (2), 3.0+ Worth a look (1), and below 3.0 Long shot (0 filled pips; added 2026-10-22 because 1.0, barely over a tab's entry bar, isn't worth a look). The label is worked out from the displayed number, so they always agree.
  - The raw score is only in the badge's tooltip (from 2026-10-22, at the user's request).
  - Recheck the next-big-thing ceiling (0.50) once velocity switches on (~Nov 14), since it can add up to +0.3.
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
  - OpenPublic has no dark mode, so dark here follows its black footer: a black page with lifted cards (`#1e1a1c`, a hint of pink), date tiles and the score badge on the same hue (`#3c3237`), pink-tinted borders (`#3a3236`), neutral grey fact chips (`#3a3a3a`; the user tried pink chips and preferred grey). The exception, from 2026-10-22, is a pink pill (`--accent-soft`) for a pick's tier on every card (picks, Soon, Your rooms, the Backstage band sheet) and for "Moving up", off-white text (`#ededed`, not pure white), grey text `#b0b0b0` and a lighter pink for text (`#ff7ab8`). The user found pure white on near-black cards hard on the eyes.
  - Pink is kept rare: the strength dots, the Strong edge, "Tonight" and out-of-town regions. The Strong label is plain text. Tickets is a pink text link (`--ticket-text`: `#cc0077` in light, `#ff5cad` in dark, a little stronger than the `#ff7ab8` used for other dark-mode pink text). The user tried a pill and dropped it because it pulled too much focus.
  - In light mode the page is off-white (`#fafafa`) so the white cards lift off it, mirroring dark mode's lighter cards on black.
  - In light mode, date tiles and the score badge are pale pink (`#ffe9f4`), fact chips are neutral grey (`#f0f0f0`, matching dark mode's grey chips), and highlighted chips stay pink (`#ffdcee`), so a pink chip means something. The user asked for these tiles to stand out more in both themes.
  - Empty pips are rings, so filled vs empty differs by shape, not just colour.
  - Body text is Inter (Google Fonts).
  - The title is Momo Trust Display, self-hosted in `site/fonts/` (Fontsource 5.3.0, OFL licence alongside). It isn't on Google Fonts and only has weight 400.

Frozen tabs (2026-10-24): the picks page's tab row sits outside `<header>` in `#tabbar` (`position: sticky`), so it scrolls up with the page and then stays at the top while the cards scroll under it. Only the tabs freeze; the count and Sort bar scrolls with the cards. Tapping a tab while the bar is frozen scrolls to the empty `#tabbar-mark` just above it, so the new list starts under the bar. A sticky element inside `<header>` only sticks while the header is on screen, which is why it moved.

Refresh: the user runs the site as a home-screen app, which resumes the old page and has no reload control. A footer shows "Loaded <time> · Refresh"; Refresh reloads with a throwaway `?r=` query, which is then stripped from the address. Reopening the app more than an hour after load reloads it automatically (`visibilitychange` / `pageshow`, `STALE_MS` in `foot.js`). Refresh keeps the URL hash, so Backstage reopens on the same tab. The digest fetch was already `no-store`.

Dates: setlist.fm dates (`DD-MM-YYYY`) are built as local dates in `renderAttended`. Parsing a bare `YYYY-MM-DD` string reads it as UTC midnight, which showed every attended show a day early in Toronto (fixed 2026-10-18). Event `starts_at` values carry a time with no zone, so they already parse as local.

Preferences are saved in `localStorage` under `nbt.sort` and `nbt.theme`; votes keep the same `nbt.votes` format.

Footer (every page, built by `site/foot.js` into `<footer class="site-foot" data-page="…">`), top to bottom:
- the site icon
- two large links, Picks and Backstage. The current page shows in text colour. SF overlap is research, so it's linked only from Backstage.
- "Loaded <time> · Refresh" and the theme switch. The switch moved here from the Picks header (2026-10-19), so every page can change the theme.
- a muted "Code on GitHub" link.

Picks header line: "Updated <weekday time> · N upcoming shows checked against N bands you know · Growth tracking: day N of 28". The weekday shows whether today's run has landed. The growth note counts up to the 4 weeks of snapshots velocity needs (`GROWTH_DAYS` in `app.js`, mirroring `velocity_min_weeks`), then disappears.

Band sheet (Backstage): in light mode it uses the page background over a 45% backdrop. In dark mode the page is black, so the sheet uses `--surface` with a border and a 72% backdrop. On phones it has a drag-handle bar.

iOS text inflation: `html { -webkit-text-size-adjust: 100% }` in `style.css` stops iOS Safari enlarging text in content wider than the screen; it had blown up the show lists in the SF overlap tables. Show lists wrap on phones and stay on one line from 601px.

Home-screen icon: two beamed eighth notes, white on `#FF1493`, with the beam rising into an arrow (chosen 2026-10-18). The source is `site/icons/icon.svg`, which is also the favicon. `apple-touch-icon.png` (180px) and `favicon-32.png` are rendered from it with Playwright. All three pages link them and set `apple-mobile-web-app-title` to "NBT". There's deliberately no `theme-color`: it would tint Safari's toolbar pink. iOS caches the icon, so after a change, delete the home-screen app and add it again.

The Climb's pace references (`site/data/ladder_study.json`, written by `research/ladder_study.py`): the "for pace" box gives each aughts favourite's time from a small room to 2,300+, and the "from first show" chart draws them as dashed staircases (biggest room so far, the same rule as the bands' lines). Long setlist.fm venue names are shortened with `VENUE_NICK` in `explore.js`. Labels that would land on top of each other are spaced apart.
