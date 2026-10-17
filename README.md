# next-big-thing

Shows coming to Toronto, scored against 20 years of Last.fm scrobbles, in three tiers:

1. **Next big thing.** Small artists (≤50k Last.fm listeners) close to your taste. Scored up for intimate venues, fast listener growth, and sharing a bill with someone you love. This is the one worth checking daily.
2. **Bands you know.** Artists you've played on 3 or more distinct days. Hamilton and Buffalo included, but only for your top 200.
3. **You'd probably like.** Unknown artists close to your taste, no listener cap.

Every pick explains itself. The **ledger** records each next-big-thing artist's listener count on the day it was first flagged — over time it shows who actually blew up.

**[Open the digest →](https://quepol.github.io/next-big-thing/)**

## Running locally

```sh
pip install -r requirements.txt
cp .env.example .env          # add your API keys
python -m pytest -q
python -m nbt run             # full pipeline
python -m http.server -d site # preview the site
```

Required environment variables (also set as GitHub Actions secrets):
- `LASTFM_API_KEY` — from <https://www.last.fm/api/account/create>
- `TICKETMASTER_API_KEY` — from <https://developer.ticketmaster.com>
- `SETLISTFM_API_KEY` — from <https://api.setlist.fm/docs/1.0/index.html>

The Last.fm user defaults to `quepol` (`nbt/config.py`); set `LASTFM_USER` to override.

**Excluding artists:** add to `data/exclude.txt`, one per line. They're dropped everywhere — no alerts, not used as taste seeds, not in the tag profile. Prefix with `+` to mark an artist as confirmed yours (e.g. `+ Selena Gomez`). Run `python -m nbt summary` to flag likely kids' or video-game artists by their Last.fm tags.

> **Privacy:** on a free GitHub plan, Pages requires a public repo, which makes `data/` (your per-artist listening history) public.
