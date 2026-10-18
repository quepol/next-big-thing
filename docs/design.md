# Site design (picks page and shared styles)

How the picks page looks and behaves, and why. The rules that matter every session (contrast split, pink kept rare, raw score visible, phone first) are summarised in `CLAUDE.md`. The explore and venue pages are in `docs/research.md`.

## Cards (redesigned 2026-10-17)

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

Preferences are saved in `localStorage` under `nbt.sort` and `nbt.theme`; votes keep the same `nbt.votes` format.
