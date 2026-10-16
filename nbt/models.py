from __future__ import annotations

from dataclasses import dataclass, field, asdict
import math
import re
import unicodedata


def normalize_name(name: str) -> str:
    """Canonical form for matching artist names across sources.

    Strips accents and punctuation but keeps letters from every script: an ASCII-only
    version turned all Japanese/Korean/Cyrillic names into "" (history check #3).
    """
    out, base = [], ""
    for ch in unicodedata.normalize("NFKD", name):
        # Drop accents on Latin letters only; kana voicing marks etc. are meaningful.
        if unicodedata.combining(ch) and base and ord(base) < 0x250:
            continue
        out.append(ch)
        base = ch
    s = unicodedata.normalize("NFC", "".join(out))
    s = s.casefold().replace("&", " and ")
    s = re.sub(r"^the\s+", "", s.strip())
    s = re.sub(r"[\W_]+", " ", s).strip()
    # Symbol-only names (e.g. "†††") would otherwise all collapse to "" and collide.
    return s or name.strip().casefold()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@dataclass
class Venue:
    name: str
    city: str
    lat: float | None = None
    lon: float | None = None


@dataclass
class Event:
    id: str
    starts_at: str  # ISO 8601, local time
    venue: Venue
    lineup: list[str]  # headliner first, when the source says so
    url: str = ""
    source: str = ""
    region: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Event":
        return cls(**{**d, "venue": Venue(**d["venue"])})


@dataclass
class Pick:
    """One artist at one event, scored for one tier."""

    tier: str  # "know" | "would_like" | "next_big_thing"
    artist: str
    event: Event
    score: float
    reasons: list[str] = field(default_factory=list)
    listeners: int | None = None
    heard_before: dict | None = None  # {"days": n, "first": "YYYY-MM-DD"} for barely-known artists

    def to_dict(self) -> dict:
        d = asdict(self)
        d["score"] = round(self.score, 4)
        return d
