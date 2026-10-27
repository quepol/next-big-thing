"""Print Last.fm's raw answers for names that resolve to the wrong artist (issue #8).

Run by .github/workflows/lastfm-probe.yml; commits nothing. Uses no cache.
"""

import json

from nbt.lastfm import LastFM


def show(fm, label, method, **p):
    body = fm.call(method, **p)
    if body and "artist" in body:
        a = body["artist"]
        out = {"name": a["name"], "mbid": a.get("mbid"), "listeners": a["stats"]["listeners"], "url": a.get("url")}
    elif body and "results" in body:
        hits = body["results"]["artistmatches"]["artist"]
        out = [{k: h.get(k) for k in ("name", "mbid", "listeners", "url")} for h in (hits if isinstance(hits, list) else [hits])][:6]
    else:
        out = body
    print(f"--- {label}: {method} {p}\n{json.dumps(out, ensure_ascii=False, indent=1)}")


fm = LastFM()
for name in ["Florence + the Machine", "Florence + The Machine", "Florence and the Machine", "Florence the Machine"]:
    show(fm, name, "artist.getinfo", artist=name, autocorrect=1)
    show(fm, name + " (no autocorrect)", "artist.getinfo", artist=name, autocorrect=0)
for q in ["florence the machine", "Florence + the Machine", "florence"]:
    show(fm, "search", "artist.search", artist=q, limit=6)
show(fm, "by mbid", "artist.getinfo", mbid="5fee3020-513b-48c2-b1f7-4681b01db0c6")
show(fm, "Jake Vaadeland", "artist.search", artist="jake vaadeland", limit=6)
