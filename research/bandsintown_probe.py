"""One-off probe: is Bandsintown's past-events data good enough for the venue ladder?

For a handful of artists, fetch every past event and report how far back the history
goes, whether lineups list the headliner first, and how many of setlist.fm's Toronto
dates Bandsintown also has. Writes research/bandsintown_probe.json.

Run by .github/workflows/bandsintown-probe.yml.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "research" / "bandsintown_probe.json"
APP_ID = os.environ["BANDSINTOWN_APP_ID"]
REST = "https://rest.bandsintown.com"

# The user's aughts favourites, whose SF climb they remember (Café du Nord → Independent
# → Regency → Warfield), plus 20 bands from the venue page's "Moving up" list.
AUGHTS = ["The National", "Arcade Fire", "The Decemberists", "Bon Iver", "Guster"]
MOVING_UP = [
    "Charlotte Cornfield", "Arm's Length", "CRi", "Signs of the Swarm", "nate sib",
    "Allison Russell", "Anxious", "Babehoven", "Calling All Captains", "Full of Hell",
    "LP Giobbi", "Matt Hansen", "Model/Actriz", "Phobophilic", "Quicksand", "Sharp Pins",
    "Teen Mortgage", "Tiny Habits", "Agriculture", "Buzz Kull",
]


def past_events(artist: str) -> tuple[int, list[dict]]:
    # Bandsintown wants "/" inside a name escaped twice (documented quirk).
    name = quote(artist.replace("/", "%252F"), safe="%")
    r = requests.get(f"{REST}/artists/{name}/events", timeout=30,
                     params={"app_id": APP_ID, "date": "past"})
    time.sleep(0.5)
    try:
        body = r.json()
    except ValueError:
        body = None
    return r.status_code, body if isinstance(body, list) else []


def norm(s: str) -> str:
    return "".join(ch for ch in s.lower().replace("’", "'") if ch.isalnum())


def main() -> None:
    research = json.loads((ROOT / "site" / "data" / "venue_research.json").read_text())
    slf_toronto = {norm(a["artist"]): {s["date"] for s in a["shows"]} for a in research["repeat_artists"]}

    report = []
    for group, names in (("aughts", AUGHTS), ("moving_up", MOVING_UP)):
        for artist in names:
            status, events = past_events(artist)
            rows = []
            for e in events:
                v = e.get("venue") or {}
                lineup = e.get("lineup") or []
                pos = next((i for i, n in enumerate(lineup) if norm(n) == norm(artist)), None)
                rows.append({
                    "date": (e.get("datetime") or "")[:10],
                    "venue": v.get("name"), "city": v.get("city"), "country": v.get("country"),
                    "lineup": lineup, "position": pos,
                })
            rows.sort(key=lambda r: r["date"])
            toronto = [r for r in rows if (r["city"] or "").lower() == "toronto"]
            sf = [r for r in rows if (r["city"] or "").lower() == "san francisco"]
            slf = slf_toronto.get(norm(artist), set())
            bit_dates = {r["date"] for r in toronto}
            report.append({
                "group": group, "artist": artist, "http": status, "events": len(rows),
                "first": rows[0]["date"] if rows else None, "last": rows[-1]["date"] if rows else None,
                "by_year": {y: sum(r["date"].startswith(y) for r in rows) for y in sorted({r["date"][:4] for r in rows})},
                "multi_artist_lineups": sum(len(r["lineup"]) > 1 for r in rows),
                "listed_first": sum(r["position"] == 0 for r in rows),
                "listed_later": sum((r["position"] or 0) > 0 for r in rows),
                "not_in_lineup": sum(r["position"] is None for r in rows),
                "toronto": toronto, "sf": sf,
                "setlistfm_toronto_dates": sorted(slf),
                "setlistfm_dates_also_in_bandsintown": sorted(slf & bit_dates),
            })
            print(f"{group:9} {artist:22} http {status} events {len(rows):4} "
                  f"{report[-1]['first']}..{report[-1]['last']} toronto {len(toronto)} sf {len(sf)} "
                  f"later-in-lineup {report[-1]['listed_later']} slf-match {len(slf & bit_dates)}/{len(slf)}", flush=True)

    OUT.write_text(json.dumps(report, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
