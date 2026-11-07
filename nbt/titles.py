"""Split a Ticketmaster event title into acts, for events with no attraction list.

TicketWeb rarely lists attractions, so the lineup was the whole title: "Soft Set w/ Swiims,
Away Forward & Seaver" was looked up on Last.fm as one artist and never scored, and those are
mostly small-room shows, next-big-thing territory (#10).

Conservative on purpose. A bad split is worse than none: a fragment such as "Rock" would be
looked up as an artist. So:
- split only on explicit billing markers ("w/", "with", "Presents:", " - " suffixes, "|" club
  tags, "@ venue");
- split on "&", "and" and commas only inside a support list, never in the headliner's name
  (Shovels & Rope, Florence + the Machine);
- leave tribute nights, parties, screenings and the like as they are.
"""

from __future__ import annotations

import re

# Not a band lineup: leave the title alone (it gets no taste match, as before).
NOT_A_LINEUP = re.compile(
    r"\b(tribute|party|parties|night|nights|film|movie|screening|in concert|ball|masquerade|"
    r"festival|fest|showcase|open mic|karaoke|comedy|drag|brunch|dance|rave|vol\.?|edition|"
    r"experience|celebration|christmas|halloween|holiday|nye|new years?|"
    r"featuring|feat\.?|dancing with)\b",
    re.I,
)
# Words that are never an act on their own.
PLACEHOLDER = re.compile(r"^(special guests?|guests?|more|many more|friends|tba|tbc|tbd|and more)$", re.I)
TOUR = re.compile(r"\b(tour|world tour|release|album|ep|show)\b", re.I)


def _clean(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)", "", name)  # "(indiesleaze)", "(DJ set)"
    name = re.sub(r"^(and|plus|special guests?:?)\s+", "", name.strip(), flags=re.I)
    name = re.sub(r"\s+performing$", "", name, flags=re.I)
    return name.strip(" ,.;:-–—+")


def _supports(text: str) -> list[str]:
    """A support list: "DERIVATIVE, Vulpecula & Truth In Jest" -> three acts."""
    # "& the" / "and the" joins a band's own name: "Steve Tidy & the Unkempt".
    parts = re.split(r",\s*|\s+(?:&|and)\s+(?!the\b)|\s+\+\s+|\s+plus\s+", text, flags=re.I)
    return [p for p in (_clean(x) for x in parts) if p and not PLACEHOLDER.match(p)]


def split_title(title: str) -> list[str]:
    """Acts in a show title, headliner first. Returns [title] when it can't tell."""
    t = re.sub(r"\s+", " ", title).strip()
    if not t or NOT_A_LINEUP.search(t):
        return [title]
    # "Aj Christou | 4AM License": the part after a bar is the promoter or club night.
    t = t.split(" | ")[0].strip()
    # "Nitepunk @ Runnymede Hall - Nov 27": the venue and date aren't acts.
    t = re.sub(r"\s+@\s+.*$", "", t)
    # "Around The Corner Presents: Man Is Five, Mad Iris…": the acts follow the colon.
    m = re.match(r"^.*?\bpresents?\s*:\s*(.+)$", t, re.I)
    if m:
        acts = _supports(m.group(1))
        return acts or [title]
    # "Mack Geiger - When It's Pouring 2026 Tour": the act is before the dash, unless the
    # left side is the tour name ("Sevalynn Fall Tour 2026 Toronto - Rune, Sevalynn, Afraid.").
    m = re.match(r"^(.+?)\s+[-–—]\s+(.+)$", t)
    if m:
        left, right = m.groups()
        if TOUR.search(left) and not TOUR.search(right):
            if not re.search(r"\s(?:w/|with)\s", right, re.I):
                return _supports(right) or [title]
            t = right
        else:
            t = left
    # "Runway with: Bodywash and Uncaught": an event name, then its acts.
    m = re.match(r"^(.+?)\s+(?:w/|with):\s*(.+)$", t, re.I)
    if m:
        return _supports(m.group(2)) or [title]
    # "Soft Set w/ Swiims, Away Forward & Seaver": headliner, then a support list.
    m = re.match(r"^(.+?)\s+(?:w/|with)\s+(.+)$", t, re.I)
    if m:
        head, rest = _clean(m.group(1)), m.group(2)
        acts = [head] + [a for a in _supports(rest) if a.lower() != head.lower()]
        return acts if head else [title]
    # No billing marker: just tidy the name ("Eelke Kleijn (Live)"). A comma here may be
    # the band's own name (Earth, Wind & Fire), so leave those alone.
    head = _clean(t)
    return [head] if head and "," not in head else [title]
