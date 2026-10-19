"""Tunable settings. Everything a human might want to tweak lives here."""

from dataclasses import dataclass
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SITE_DIR = ROOT / "site"


@dataclass(frozen=True)
class Region:
    name: str
    lat: float
    lon: float
    radius_km: float
    # "all" = every tier is eligible; "loved" = only bands you love are worth the trip
    tiers: str = "all"


@dataclass(frozen=True)
class Config:
    lastfm_user: str = os.environ.get("LASTFM_USER") or "quepol"
    # setlist.fm username, if it differs from the Last.fm one.
    setlistfm_user: str = os.environ.get("SETLISTFM_USER") or os.environ.get("LASTFM_USER") or "quepol"
    # Where "a day" starts and ends when counting distinct days played.
    timezone: str = "America/Toronto"
    lastfm_api_key: str = os.environ.get("LASTFM_API_KEY", "")
    bandsintown_app_id: str = os.environ.get("BANDSINTOWN_APP_ID", "")
    ticketmaster_api_key: str = os.environ.get("TICKETMASTER_API_KEY", "")
    setlistfm_api_key: str = os.environ.get("SETLISTFM_API_KEY", "")

    regions: tuple[Region, ...] = (
        Region("Toronto", 43.6532, -79.3832, 40),
        Region("Hamilton", 43.2557, -79.8711, 20, tiers="loved"),
        Region("Buffalo", 42.8864, -78.8784, 25, tiers="loved"),
    )

    # An artist counts as "known" once played on this many distinct days.
    known_min_days: int = 3
    # Top-N known artists (by distinct days) count as "loved" for out-of-town alerts.
    loved_top_n: int = 200
    # Seeds for the taste graph: top-N known artists by distinct days.
    taste_seeds: int = 300
    similar_limit: int = 50

    # Next-big-thing thresholds.
    nbt_max_listeners: int = 100_000
    nbt_min_affinity: float = 0.15
    would_like_min_affinity: float = 0.35
    # Weeks of listener snapshots needed before velocity is trusted.
    velocity_min_weeks: int = 4

    lookahead_days: int = 90
    cache_ttl_days: int = 30



CONFIG = Config()
