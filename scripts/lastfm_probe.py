"""One-off: which listening links does MusicBrainz have for today's picks?

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


import collections
kinds = collections.Counter()
found = 0
for name, tier in artists:
    info = fm.artist_info(name) or {}
    mbid, how = info.get("mbid") or "", "last.fm"
    if not mbid:
        hits = mb("artist", query=f'artist:"{name}"', limit=5).get("artists", [])
        exact = [a for a in hits if normalize_name(a["name"]) == normalize_name(name) and int(a.get("score", 0)) >= 95]
        mbid, how = (exact[0]["id"], "mb search") if len(exact) == 1 else ("", "none" if not exact else "ambiguous")
    sites = {}
    if mbid:
        for r in mb(f"artist/{mbid}", inc="url-rels").get("relations", []):
            url = r.get("url", {}).get("resource", "")
            host = urllib.parse.urlparse(url).netloc.replace("www.", "")
            for k in ("soundcloud.com", "bandcamp.com", "spotify.com", "music.apple.com", "youtube.com", "deezer.com", "tidal.com"):
                if host.endswith(k):
                    sites.setdefault(k, url)
            if r.get("type") == "official homepage":
                sites.setdefault("homepage", url)
    kinds.update(sites.keys())
    found += bool(sites)
    print(f"{tier:15} {name[:28]:28} {str(info.get('listeners')):>8} mbid={'y' if mbid else 'n'}({how}) {sorted(sites)}")
print(f"\n{found} of {len(artists)} picks have at least one listening link; by site: {dict(kinds)}")
