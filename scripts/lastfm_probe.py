"""One-off: how many of today's picks have a SoundCloud profile on MusicBrainz?

Run by .github/workflows/lastfm-probe.yml; commits nothing. For each pick: the MBID from
Last.fm (or an exact-name MusicBrainz search), then MusicBrainz url-rels for soundcloud.com.
"""

import json
import time
import urllib.parse

import requests

from nbt.lastfm import LastFM
from nbt.models import normalize_name

UA = {"User-Agent": "next-big-thing/0.1 (https://github.com/quepol/next-big-thing)"}
MB = "https://musicbrainz.org/ws/2"

fm = LastFM()
digest = json.load(open("site/data/digest.json"))
artists = []
for tier in ("next_big_thing", "would_like", "know"):
    for p in digest["picks"].get(tier, []):
        if p["artist"] not in {a for a, _ in artists}:
            artists.append((p["artist"], tier))


def mb(path, **params):
    time.sleep(1.1)  # MusicBrainz asks for at most 1 request a second
    r = requests.get(f"{MB}/{path}", params={**params, "fmt": "json"}, headers=UA, timeout=30)
    return r.json() if r.ok else {}


found = 0
for name, tier in artists:
    info = fm.artist_info(name) or {}
    mbid, how = info.get("mbid") or "", "last.fm"
    if not mbid:
        hits = mb("artist", query=f'artist:"{name}"', limit=5).get("artists", [])
        exact = [a for a in hits if normalize_name(a["name"]) == normalize_name(name) and int(a.get("score", 0)) >= 95]
        mbid, how = (exact[0]["id"], "mb search") if len(exact) == 1 else ("", "none" if not exact else "ambiguous")
    sc = []
    if mbid:
        rels = mb(f"artist/{mbid}", inc="url-rels").get("relations", [])
        sc = [r["url"]["resource"] for r in rels if "soundcloud.com" in r.get("url", {}).get("resource", "")]
    found += bool(sc)
    print(f"{tier:15} {name[:30]:30} listeners={info.get('listeners')} mbid={'yes' if mbid else 'no'}({how}) soundcloud={sc[:1]}")
print(f"\n{found} of {len(artists)} picks have a SoundCloud URL on MusicBrainz")
