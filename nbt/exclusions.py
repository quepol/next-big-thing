"""Artists to ignore everywhere: not alerted, not seeds, not in the tag profile.

The main source is other people's listening on the same account (kids), which would
otherwise dominate the seeds: kids replay favourites on many distinct days.
"""

from __future__ import annotations

from pathlib import Path

from .config import DATA_DIR
from .models import normalize_name

EXCLUDE_PATH = DATA_DIR / "exclude.txt"
LOVES_PATH = DATA_DIR / "loves.txt"

# Last.fm tags that mark children's music. Teen pop won't carry these; 👎 covers that.
KID_TAGS = {
    "children's music", "childrens music", "children", "kids", "kids music", "for kids",
    "disney", "nursery rhymes", "lullaby", "lullabies", "children's", "kindie",
}
# Older kids: these franchises and the YouTube musicians around them are always the
# kids' (user's rule), so they count as kids' tags.
KID_FRANCHISE_TAGS = {
    "fnaf", "five nights at freddy's", "bendy", "bendy and the ink machine", "undertale",
    "deltarune", "ultrakill", "friday night funkin", "friday night funkin'", "fnf",
    "roblox", "minecraft", "poppy playtime", "vocaloid", "hatsune miku", "cg5", "gaming",
}
# Generic game-music tags: review only. Orchestral scores (Death Stranding) are the
# user's; Fallout's soundtrack is 1940s records that may be too.
GAME_TAGS = {
    "video game music", "video game", "video games", "game music", "game soundtrack",
    "video game soundtrack", "vgm", "fallout",
}
KID_TAG_MIN_COUNT = 20  # Last.fm tag weights are 0-100; ignore stray low-weight tags


def _entries(path: Path) -> list[str]:
    try:
        lines = path.read_text().splitlines()
    except FileNotFoundError:
        return []
    return [e for e in (line.split("#", 1)[0].strip() for line in lines) if e]


def load(path: Path = EXCLUDE_PATH) -> set[str]:
    """Normalized names to exclude. One per line; '#' starts a comment; '+' lines are keeps."""
    return {normalize_name(e) for e in _entries(path) if not e.startswith("+")}


def load_loves(path: Path = LOVES_PATH) -> set[str]:
    """All-time favourites that bypass recency decay. One artist per line; '#' is a comment."""
    return {normalize_name(e) for e in _entries(path)}


def load_keeps(path: Path = EXCLUDE_PATH) -> set[str]:
    """Artists confirmed as the user's own ('+ Name'), so the summary stops flagging them."""
    return {normalize_name(e[1:].strip()) for e in _entries(path) if e.startswith("+")}


def kid_tags(tags: dict[str, int]) -> list[str]:
    """Tags that make an artist the kids' (excluded automatically)."""
    return [t for t, c in tags.items() if t in KID_TAGS | KID_FRANCHISE_TAGS and c >= KID_TAG_MIN_COUNT]


def game_tags(tags: dict[str, int]) -> list[str]:
    """Generic game-music tags: worth a look, not excluded."""
    return [t for t, c in tags.items() if t in GAME_TAGS and c >= KID_TAG_MIN_COUNT]


def effective(history: dict, lastfm, min_days: int) -> tuple[set[str], dict[str, list[str]]]:
    """Manual exclusions plus known artists auto-excluded by kids' tags, minus '+' keeps.

    Returns (excluded keys, {auto-excluded key: tags}) so callers can show what happened.
    """
    manual, keeps = load(), load_keeps()
    auto: dict[str, list[str]] = {}
    for key, row in history["artists"].items():
        if row["days"] < min_days or key in manual or key in keeps:
            continue
        tags = kid_tags(lastfm.top_tags(row["name"]))
        if tags:
            auto[key] = tags
    return manual | set(auto), auto
