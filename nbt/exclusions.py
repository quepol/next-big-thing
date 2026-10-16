"""Artists to ignore everywhere: not alerted, not seeds, not in the tag profile.

The main source is other people's listening on the same account (kids), which would
otherwise dominate the seeds: kids replay favourites on many distinct days.
"""

from __future__ import annotations

from pathlib import Path

from .config import DATA_DIR
from .models import normalize_name

EXCLUDE_PATH = DATA_DIR / "exclude.txt"

# Last.fm tags that mark children's music. Teen pop won't carry these; 👎 covers that.
KID_TAGS = {
    "children's music", "childrens music", "children", "kids", "kids music", "for kids",
    "disney", "nursery rhymes", "lullaby", "lullabies", "children's", "kindie",
}
KID_TAG_MIN_COUNT = 20  # Last.fm tag weights are 0-100; ignore stray low-weight tags


def load(path: Path = EXCLUDE_PATH) -> set[str]:
    """Normalized names from a one-artist-per-line file; '#' starts a comment."""
    try:
        lines = path.read_text().splitlines()
    except FileNotFoundError:
        return set()
    names = (line.split("#", 1)[0].strip() for line in lines)
    return {normalize_name(n) for n in names if n}


def kid_tags(tags: dict[str, int]) -> list[str]:
    return [t for t, c in tags.items() if t in KID_TAGS and c >= KID_TAG_MIN_COUNT]
