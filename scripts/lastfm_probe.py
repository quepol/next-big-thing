"""Print Last.fm's raw answers for names that resolve to the wrong artist (issue #8).

Run by .github/workflows/lastfm-probe.yml; commits nothing. Uses no cache.

Probe 2: Last.fm decodes the artist parameter twice, so "+" arrives as a space
("Florence   The Machine", 19,924 listeners). Does sending "%2B" reach the real one?
"""

import json

from nbt.lastfm import LastFM


def show(fm, label, method, **p):
    body = fm.call(method, **p)
    if body and "artist" in body:
        a = body["artist"]
        out = {"name": a["name"], "mbid": a.get("mbid"), "listeners": a["stats"]["listeners"], "url": a.get("url")}
    elif body and "similarartists" in body:
        out = [(s["name"], s["match"]) for s in body["similarartists"]["artist"][:5]]
    elif body and "toptags" in body:
        out = [(t["name"], t["count"]) for t in body["toptags"]["tag"][:5]]
    else:
        out = body
    print(f"--- {label}: {method} {p}\n{json.dumps(out, ensure_ascii=False)}")


fm = LastFM()
for name in ["Florence %2B the Machine", "Florence %252B the Machine"]:
    show(fm, name, "artist.getinfo", artist=name, autocorrect=1)
    show(fm, name, "artist.getsimilar", artist=name, autocorrect=1, limit=5)
    show(fm, name, "artist.gettoptags", artist=name, autocorrect=1)
# Other "+" names, to check the encoding doesn't break them.
for name in ["Coheed and Cambria", "Bob Moses", "Mumford %2B Sons", "Love %2B Rockets"]:
    show(fm, name, "artist.getinfo", artist=name, autocorrect=1)
