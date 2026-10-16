# next-big-thing

Shows coming to Toronto, scored against 20 years of Last.fm scrobbles, in three tiers:

1. **Bands you know.** Artists you've played on 3 or more distinct days. Hamilton and Buffalo are included, but only for your top 200.
2. **You'd probably like.** Artists you don't know who sit close to your taste.
3. **Next big thing.** Small artists (≤50k Last.fm listeners) who are close to your taste, scored up if they're growing fast or sharing a bill with someone you love.

Every pick comes with its reasons ("similar to Big Thief (0.90) · sharing the bill with … · only 2,400 listeners").
The **ledger** records each next-big-thing artist's listener count on the day it was first flagged. Over time it shows who actually blew up, and it gives us the data to backtest the scoring.

## How it works

```
GitHub Actions (daily)
  history   Last.fm scrobbles → per-artist {distinct days, plays, first, last}   data/history.json
  taste     your top 300 artists → Last.fm similar artists + tag profile
  events    Bandsintown: Toronto city feed (TODO) + artist-first lookups        data/snapshots/events/
  score     tiers + reasons
  snapshot  listener counts for every artist seen (feeds the velocity signal)   data/snapshots/listeners/
  ledger    first-flagged listener counts                                       data/ledger.json
  digest    site/data/digest.json → GitHub Pages (static site/)
```

**Affinity** draws on three kinds of evidence, strongest first:
- **Forward:** a candidate appears in one of your seed artists' similar-artist lists.
- **Reverse:** one of your known artists appears in the candidate's similar-artist list.
- **Tags:** overlap with your taste profile. This is the fallback for tiny artists that have no similarity data, and it's capped at 0.6.

Seeds are weighted by log(distinct days), so a 20-year habit counts for more than a one-month binge.

**Velocity** is compound weekly growth in Last.fm listeners, calculated from our own daily snapshots, because Last.fm has no history API. It switches on once we have 4 weeks of snapshots.

## Status

- [x] Last.fm client, resumable 20-year history backfill, incremental top-ups
- [x] Taste model, scoring, ledger, snapshots
- [x] Static site with tabs, reasons and 👍/👎 (votes stay in your browser for now)
- [x] Daily workflow and Pages deploy
- [ ] **Toronto city feed scraper** (`nbt/sources/bandsintown.py: city_events`). The next-big-thing tier depends on it. It's blocked until we can check the live page structure and its coverage against small venues' own calendars.
- [ ] Feed 👍/👎 back into scoring
- [ ] Email digest
- [ ] Curator signals (KEXP, Tiny Desk, labels)

## Setup

1. Create a Last.fm API key at <https://www.last.fm/api/account/create>.
2. In the repo settings, add:
   - the secret `LASTFM_API_KEY`
   - optionally, the secret `BANDSINTOWN_APP_ID`, which enables artist-first lookups

   The Last.fm user defaults to `quepol` (`nbt/config.py`); set `LASTFM_USER` to override it.
3. Set **Settings → Pages → Source** to "GitHub Actions".
4. Run the **Daily digest** workflow manually once. The first run backfills your whole scrobble history; the job saves progress as it goes, so it can resume if interrupted.

To run locally:

```sh
pip install -r requirements.txt pytest
python -m pytest -q
LASTFM_API_KEY=... python -m nbt history   # history only
LASTFM_API_KEY=... python -m nbt run       # everything
python -m http.server -d site 8000          # demo data until a digest exists
```

Settings you might want to tune are in `nbt/config.py`.

**Excluding artists:** list artists in `data/exclude.txt`, one per line. They're dropped everywhere: no alerts, not used as taste seeds, not counted in the tag profile. Use it for listening that isn't yours (e.g. the kids). `python -m nbt summary` flags likely kids' and video-game artists by their Last.fm tags. A line starting with `+` (e.g. `+ Selena Gomez`) marks an artist as confirmed yours, so it's never excluded or re-flagged. Unknown artists tagged as kids' or video-game music are never recommended.

> **Privacy:** on a free GitHub plan, Pages needs a public repo, which would make `data/` (your per-artist listening history) public.
