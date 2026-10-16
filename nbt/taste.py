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

from . import exclusions
from .config import CONFIG
from .history import known
from .models import normalize_name

TAG_ONLY_CAP = 0.6  # tag overlap alone is weak evidence; never let it look like a strong match
TAG_PROFILE_SEEDS = 100
NOISE_TAGS = {"seen live", "favorites", "favourite", "favorite", "my favorites", "awesome", "love"}


class Taste:
    def __init__(self, history: dict, lastfm, *, log=print, excluded: set[str] | None = None):
        self.lastfm = lastfm
        self.excluded = exclusions.load() if excluded is None else excluded
        self.known = known(history, excluded=self.excluded)
        ranked = sorted(self.known.items(), key=lambda kv: (-kv[1]["days"], -kv[1]["plays"]))
        top = ranked[: CONFIG.taste_seeds]
        max_days = top[0][1]["days"] if top else 1
        # Seed weight: log-scaled distinct days, so a 20-year habit beats a one-month binge
        # without drowning everything else out.
        self.weights = {k: math.log1p(v["days"]) / math.log1p(max_days) for k, v in self.known.items()}
        self.seeds = [k for k, _ in top]
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
        scored = sorted(self.forward.items(), key=lambda kv: -self._raw(kv[1]))
        return [self.names[k] for k, _ in scored[:n]]

    def _raw(self, per_seed: dict[str, float]) -> float:
        return sum(self.weights.get(s, 0) * m for s, m in per_seed.items())

    def affinity(self, artist: str) -> tuple[float, list[str]]:
        key = normalize_name(artist)
        per_seed = dict(self.forward.get(key, {}))
        for name, match in self.lastfm.similar(artist):
            k = normalize_name(name)
            if k in self.known:
                per_seed[k] = max(per_seed.get(k, 0.0), match)

        if per_seed:
            raw = self._raw(per_seed)
            aff = 1 - math.exp(-raw)
            top = sorted(per_seed.items(), key=lambda kv: -self.weights.get(kv[0], 0) * kv[1])[:3]
            reasons = ["similar to " + ", ".join(f"{self.known[k]['name']} ({m:.2f})" for k, m in top)]
            return aff, reasons

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
