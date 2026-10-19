# next-big-thing

Shows coming to Toronto, scored against 20 years of Last.fm scrobbles, in three tiers:

1. **Next big thing.** Small artists (≤100K Last.fm listeners) close to your taste. Small rooms score a little higher. This is the one worth checking daily: catching a future-big band in a small room.
2. **You'd probably like.** Artists close to your taste, at any size, including ones you've heard of but don't play.
3. **Bands you know.** Artists you've played on 3 or more distinct days. Hamilton and Buffalo shows count too, but only for your top 200 artists and bands you've seen live.

Every pick explains itself ("similar to X 0.62"). The **ledger** records each next-big-thing artist's listener count on the day it was first flagged, so over time it shows who actually blew up.

**[Open the digest →](https://quepol.github.io/next-big-thing/)**

## Make your own

You need a Last.fm account with a few years of scrobbles and a free GitHub account. It runs entirely on GitHub: a daily job builds the picks, and GitHub Pages serves the site.

1. **Fork this repo.**
2. **Clear out my data.** Delete `data/history.json`, `data/ledger.json` and `data/snapshots/`, and empty `data/loves.txt` and `data/exclude.txt`. Commit.
3. **Get API keys** (all free):
   - Last.fm: <https://www.last.fm/api/account/create>
   - Ticketmaster: <https://developer.ticketmaster.com> (the Discovery API; it includes TicketWeb)
   - setlist.fm (optional): <https://www.setlist.fm/settings/api>. It adds the shows you've logged as attended to your taste.
4. **Add them to your fork.** Go to Settings → Secrets and variables → Actions.
   - Secrets: `LASTFM_API_KEY`, `TICKETMASTER_API_KEY`, and optionally `SETLISTFM_API_KEY`.
   - Variables: `LASTFM_USER` (your Last.fm username). Add `SETLISTFM_USER` only if it's different from your Last.fm username.
5. **Set your city.** In `nbt/config.py`, change `regions` to your city's latitude and longitude, plus any nearby cities you'd travel to for bands you love. Set `timezone` to yours.
6. **Turn it on.**
   - Actions tab: enable workflows. Forks start with them off.
   - Settings → Pages: set Source to "GitHub Actions".
7. **Run it.** Go to Actions → Daily digest → Run workflow. The first run downloads your whole Last.fm history, which can take a few hours for a long one. After that it runs every morning in a few minutes.
8. **Open `https://<your-username>.github.io/next-big-thing/`.** On a phone, use Share → Add to Home Screen to get it as an app.

Then tune it:
- List all-time favourites in `data/loves.txt`, one per line.
- If someone shares your account (kids, say), add their artists to `data/exclude.txt`. Kids' and kid-franchise artists are already dropped automatically by their Last.fm tags.
- Run `python -m nbt summary` to list artists that may need excluding.

What won't carry over:
- The venue capacities in `nbt/sources/ticketmaster.py` are Toronto rooms. Elsewhere, picks still work but miss the small-room bonus.
- The Explore and SF overlap pages are built on my research data (`site/data/venue_research.json`).

> **Privacy:** on a free GitHub plan, Pages needs a public repo, which makes `data/` (your per-artist listening history) public.

## Running locally

```sh
pip install -r requirements.txt
cp .env.example .env               # add your keys and usernames
set -a; . ./.env; set +a           # load them into this shell
python -m pytest -q
python -m nbt run                  # full pipeline
python -m http.server -d site      # preview the site at localhost:8000
```

The Last.fm user defaults to `quepol` (`nbt/config.py`); `LASTFM_USER` overrides it, and `SETLISTFM_USER` sets setlist.fm separately.

**Excluding artists:** add them to `data/exclude.txt`, one per line. They're dropped everywhere: no alerts, not used as taste seeds, not in the tag profile. Prefix a line with `+` to mark an artist as confirmed yours (e.g. `+ Selena Gomez`).
