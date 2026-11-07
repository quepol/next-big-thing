"""Print Last.fm's top tags for a few artists, to check tag-only matches.

Run by .github/workflows/lastfm-probe.yml; commits nothing. Uses no cache.
"""

from nbt.lastfm import LastFM
from nbt.taste import GENERIC_TAGS, NOISE_TAGS

fm = LastFM()
for name in ["Loviet", "Devon Gabriella", "Bradley Hale", "ARK IDENTITY", "comehelpglo"]:
    body = fm.call("artist.gettoptags", artist=name, autocorrect=1)
    tags = body.get("toptags", {}).get("tag", []) if body else []
    if isinstance(tags, dict):
        tags = [tags]
    tags = [(t["name"].lower(), int(t["count"])) for t in tags[:20] if int(t["count"]) > 0]
    specific = [(t, c) for t, c in tags if t not in GENERIC_TAGS and t not in NOISE_TAGS]
    print(f"--- {name}\n  all: {tags}\n  specific: {specific}")
