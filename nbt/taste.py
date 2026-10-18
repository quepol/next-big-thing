"""How close is an artist to your taste? Returns an affinity in [0, 1] plus human reasons.

Three kinds of evidence, strongest first:
  forward  - the artist appears in Last.fm's similar-artists list of one of your seeds
  reverse  - one of your known artists appears in *their* similar-artists list
  tags     - fallback for tiny artists with no similarity data: tag overlap with your profile
Forward and reverse are merged per seed (max), so one relationship isn't double counted.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date

from . import exclusions
from .config import CONFIG
from .history import known
from .models import normalize_name

TAG_ONLY_CAP = 0.6
# Affinity uses only the strongest few seed links, with decaying weights, so it stays
# bounded and discriminating. Summing every link saturated near 1.0 for popular "hub"
# artists that appear in many seeds' similar lists (history check #1).
LINK_WEIGHTS = (1.0, 0.5, 0.25)
# Seed weight for live-attended artists not already in known history. Equivalent to
# a moderate but not dominant habit — less than someone played 100+ days, but real.
ATTENDED_SEED_WEIGHT = 0.4
# Recency: seed weight is scaled by how much you've listened in the last RECENCY_YEARS.
# At RECENCY_SCALE recent days, full weight. At 0 recent days, RECENCY_FLOOR weight.
# Artists in loves.txt bypass recency entirely.
RECENCY_YEARS = 3
RECENCY_SCALE = 10   # distinct days in RECENCY_YEARS for full seed weight
RECENCY_FLOOR = 0.3  # minimum multiplier for artists with no recent plays
# Fallback when days_by_year is absent (pre-rebuild history): exponential decay from last date.
_FALLBACK_HALF_LIFE = 3.0
ALIAS_MIN_MATCH = 0.9
ALIAS_SIZE_RATIO = 100  # tag overlap alone is weak evidence; never let it look like a strong match
TAG_PROFILE_SEEDS = 100
NOISE_TAGS = {"seen live", "favorites", "favourite", "favorite", "my favorites", "awesome", "love"}


class Taste:
    def __init__(self, history: dict, lastfm, *, log=print, excluded: set[str] | None = None,
                 attended: dict[str, str] | None = None, loves: set[str] | None = None,
                 _today: date | None = None):
        self.lastfm = lastfm
        self.excluded = exclusions.load() if excluded is None else excluded
        self.known = known(history, excluded=self.excluded)
        max_days = max((v["days"] for v in self.known.values()), default=1)
        loves = loves if loves is not None else exclusions.load_loves()
        today = _today or date.today()
        cutoff_year = today.year - RECENCY_YEARS

        def _recency(key: str, row: dict) -> float:
            if key in loves:
                return 1.0
            if row.get("days_by_year"):
                # Primary signal: distinct days in the last RECENCY_YEARS.
                recent = sum(v for k, v in row["days_by_year"].items() if int(k) >= cutoff_year)
                return RECENCY_FLOOR + (1 - RECENCY_FLOOR) * min(recent / RECENCY_SCALE, 1.0)
            # Fallback for history not yet rebuilt: decay from last-play date.
            if row.get("last"):
                years_ago = (today.toordinal() - date.fromisoformat(row["last"]).toordinal()) / 365.25
                return max(RECENCY_FLOOR, math.exp(-math.log(2) * years_ago / _FALLBACK_HALF_LIFE))
            return 1.0

        # Seed weight: log-scaled distinct days, multiplied by recency.
        # Artists in loves.txt get full weight regardless of recent play count.
        self.weights = {
            k: math.log1p(v["days"]) / math.log1p(max_days) * _recency(k, v)
            for k, v in self.known.items()
        }
        # Select top seeds: loves.txt artists first (by weight), then non-loves (by weight).
        # This ensures your intentional loves dominate the top influential slots regardless
        # of how recently a non-loves artist happened to be in rotation.
        ranked = sorted(self.known.items(),
                        key=lambda kv: (0 if kv[0] in loves else 1, -self.weights[kv[0]]))
        top = ranked[: CONFIG.taste_seeds]
        self.seeds = [k for k, _ in top]

        # Inject live-attended artists as additional seeds. These are uncontaminated by
        # kids' scrobbles. Artists already in known keep their existing seed weight.
        if attended:
            for key, name in attended.items():
                if key not in self.known and key not in self.excluded:
                    # Synthetic known entry so seed lookups (self.known[seed]["name"]) work.
                    self.known[key] = {"name": name, "days": 0, "plays": 0, "first": "", "last": ""}
                    self.weights[key] = ATTENDED_SEED_WEIGHT
                    self.seeds.append(key)

        self.forward: dict[str, dict[str, float]] = defaultdict(dict)  # candidate -> seed -> match
        self.names: dict[str, str] = {}  # candidate key -> display name from Last.fm
        for i, seed in enumerate(self.seeds):
            for name, match in lastfm.similar(self.known[seed]["name"]):
                cand = normalize_name(name)
                if cand not in self.known and cand not in self.excluded:
                    self.forward[cand][seed] = match
                    self.names.setdefault(cand, name)
            if i and i % 50 == 0:
                log(f"  taste graph: {i}/{len(self.seeds)} seeds")
        self.tag_profile = self._tag_profile(top[:TAG_PROFILE_SEEDS])

    def _tag_profile(self, rows) -> dict[str, float]:
        prof: dict[str, float] = defaultdict(float)
        for key, row in rows:
            for tag, count in self.lastfm.top_tags(row["name"]).items():
                if tag not in NOISE_TAGS:
                    prof[tag] += self.weights[key] * count / 100
        return _unit(prof)

    def top_neighbours(self, n: int) -> list[str]:
        """Names of unknown artists most strongly implied by your seeds (for artist-first event lookups)."""
        scored = sorted(self.forward.items(), key=lambda kv: -self._combine(kv[1]))
        return [self.names[k] for k, _ in scored[:n]]

    def _links(self, per_seed: dict[str, float]) -> list[tuple[str, float, float]]:
        """(seed, match, contribution) sorted strongest first."""
        links = [(s, m, self.weights.get(s, 0) * m) for s, m in per_seed.items()]
        return sorted(links, key=lambda x: -x[2])

    def _combine(self, per_seed: dict[str, float]) -> float:
        top = self._links(per_seed)[: len(LINK_WEIGHTS)]
        return sum(w * c for w, (_, _, c) in zip(LINK_WEIGHTS, top)) / sum(LINK_WEIGHTS)

    def looks_like_alias(self, artist: str) -> bool:
        """Last.fm keeps separate pages for alternate spellings (e.g. a name in another script).

        They look like tiny artists. Flag when Last.fm autocorrects the name to something
        else, or when a non-Latin name is near-identical to an artist 100x its size.
        (The script condition protects real side projects of big bands, which also sit
        next to a much bigger artist.)
        """
        info = self.lastfm.artist_info(artist)
        if not info:
            return False
        if normalize_name(info["name"]) != normalize_name(artist):
            return True
        if all(ord(ch) < 0x250 for ch in artist):
            return False
        for name, match in self.lastfm.similar(artist)[:1]:
            big = self.lastfm.artist_info(name)
            if match >= ALIAS_MIN_MATCH and big and big["listeners"] >= ALIAS_SIZE_RATIO * max(info["listeners"], 1):
                return True
        return False

    def looks_like_kids(self, artist: str) -> bool:
        """Unknown artists tagged as kids' or video-game music are never recommended."""
        return bool(exclusions.kid_tags(self.lastfm.top_tags(artist)))

    def is_noise(self, artist: str) -> bool:
        return self.looks_like_alias(artist) or self.looks_like_kids(artist)

    def affinity(self, artist: str) -> tuple[float, list[str]]:
        key = normalize_name(artist)
        per_seed = dict(self.forward.get(key, {}))
        for name, match in self.lastfm.similar(artist):
            k = normalize_name(name)
            if k in self.known:
                per_seed[k] = max(per_seed.get(k, 0.0), match)

        if per_seed:
            top = self._links(per_seed)[:3]
            reasons = ["similar to " + ", ".join(f"{self.known[k]['name']} ({m:.2f})" for k, m, _ in top)]
            return self._combine(per_seed), reasons

        tags = {t: c for t, c in self.lastfm.top_tags(artist).items() if t not in NOISE_TAGS}
        if tags and self.tag_profile:
            vec = _unit({t: c / 100 for t, c in tags.items()})
            cos = sum(vec[t] * self.tag_profile.get(t, 0) for t in vec)
            if cos > 0:
                shared = sorted(vec, key=lambda t: -vec[t] * self.tag_profile.get(t, 0))[:3]
                shared = [t for t in shared if self.tag_profile.get(t)]
                return TAG_ONLY_CAP * cos, [f"tags match your taste: {', '.join(shared)}"]
        return 0.0, []


def _unit(v: dict[str, float]) -> dict[str, float]:
    norm = math.sqrt(sum(x * x for x in v.values()))
    return {k: x / norm for k, x in v.items()} if norm else {}
