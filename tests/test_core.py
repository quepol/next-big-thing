from datetime import date, datetime, timezone

from nbt import history as hist
from nbt.config import Config
from nbt.models import Event, Venue, haversine_km, normalize_name
from nbt.scoring import score_events, smallness
from nbt.snapshots import save_listeners, velocity
from nbt.sources.bandsintown import parse_rest_event
from nbt.taste import Taste


def uts(y, m, d, h=20):
    return int(datetime(y, m, d, h, tzinfo=timezone.utc).timestamp())


def test_normalize_name():
    assert normalize_name("The Beatles") == normalize_name("beatles")
    assert normalize_name("Florence + The Machine") == "florence the machine"
    assert normalize_name("Simon & Garfunkel") == "simon and garfunkel"
    assert normalize_name("Björk") == "bjork"


def test_haversine_toronto_hamilton():
    assert 55 < haversine_km(43.6532, -79.3832, 43.2557, -79.8711) < 65


def test_ingest_counts_distinct_days_and_is_idempotent():
    h = hist.empty_history()
    plays = [
        {"artist": "Big Thief", "uts": uts(2008, 1, 1)},
        {"artist": "Big Thief", "uts": uts(2008, 1, 1, 21)},  # same day
        {"artist": "Big Thief", "uts": uts(2015, 6, 2)},
        {"artist": "Big Thief", "uts": uts(2026, 3, 3)},
        {"artist": "One-off", "uts": uts(2019, 5, 5)},
    ]
    assert hist.ingest(h, plays) == 5
    assert hist.ingest(h, plays) == 0  # already seen
    bt = h["artists"]["big thief"]
    assert (bt["days"], bt["plays"], bt["first"]) == (3, 4, "2008-01-01")
    assert set(hist.known(h)) == {"big thief"}


def test_ingest_uses_toronto_local_day():
    h = hist.empty_history()
    # 03:00 UTC on Jan 2 is still Jan 1 in Toronto
    hist.ingest(h, [{"artist": "X", "uts": uts(2020, 1, 2, 3)}])
    assert h["artists"]["x"]["first"] == "2020-01-01"


def test_smallness_is_monotonic():
    assert smallness(50, 50_000) == 1.0
    assert smallness(1_000, 50_000) > smallness(10_000, 50_000) > smallness(49_000, 50_000)
    assert smallness(80_000, 50_000) == 0.0


def test_velocity_needs_enough_history(tmp_path):
    today = date(2026, 10, 16)
    save_listeners(date(2026, 10, 1), {"x": 1000}, base=tmp_path)
    assert velocity("x", today, 2000, base=tmp_path) is None  # only 2 weeks
    save_listeners(date(2026, 8, 21), {"x": 1000}, base=tmp_path)
    growth, weeks = velocity("x", today, 2000, base=tmp_path)
    assert weeks == 8 and 0.08 < growth < 0.10  # doubled in 8 weeks ≈ 9%/week


def test_parse_rest_event():
    ev = parse_rest_event({
        "id": "123", "datetime": "2026-11-02T20:00:00", "url": "https://x",
        "lineup": ["Headliner", "Opener"],
        "venue": {"name": "The Baby G", "city": "Toronto", "region": "ON", "latitude": "43.65", "longitude": "-79.43"},
    })
    assert ev.id == "bit:123" and ev.venue.city == "Toronto, ON" and ev.venue.lat == 43.65
    assert ev.lineup == ["Headliner", "Opener"]


# --- scoring end to end with fakes -----------------------------------------

class FakeLastFM:
    SIMILAR = {
        "big thief": [("Tiny Newcomer", 0.9), ("Mid Band", 0.7), ("Adrianne Lenker", 0.95)],
        "adrianne lenker": [("Big Thief", 0.95)],
        "tiny newcomer": [],
        "mid band": [("Big Thief", 0.7)],
    }
    TAGS = {"big thief": {"indie folk": 100, "folk": 80}, "tag only kid": {"indie folk": 100}}
    INFO = {"tiny newcomer": 2_400, "mid band": 300_000, "big thief": 900_000, "tag only kid": 150, "heard once": 8_000}

    def similar(self, name):
        return self.SIMILAR.get(normalize_name(name), [])

    def top_tags(self, name):
        return self.TAGS.get(normalize_name(name), {})

    def artist_info(self, name):
        n = self.INFO.get(normalize_name(name))
        return {"name": name, "listeners": n} if n is not None else None


def make_history():
    h = hist.empty_history()
    plays = [{"artist": "Big Thief", "uts": uts(2010 + i, 1, 1)} for i in range(10)]
    plays += [{"artist": "Adrianne Lenker", "uts": uts(2018 + i, 2, 1)} for i in range(4)]
    plays += [{"artist": "Heard Once", "uts": uts(2019, 3, 1)}]
    plays.sort(key=lambda p: p["uts"])
    hist.ingest(h, plays)
    return h


def ev(lineup, region="Toronto", day="2026-11-01"):
    return Event(id="e" + lineup[0], starts_at=f"{day}T20:00:00", venue=Venue("Room", "Toronto"),
                 lineup=lineup, region=region)


def run_scoring(events, cfg=Config(lastfm_user="u", lastfm_api_key="k")):
    h = make_history()
    lfm = FakeLastFM()
    taste = Taste(h, lfm, log=lambda *_: None)
    return score_events(events, h, hist.loved(h), taste.affinity, lfm.artist_info,
                        velocity=lambda k, n: None, regions={"Toronto": "all", "Buffalo": "loved"}, cfg=cfg)


def by_artist(picks):
    return {p.artist: p for p in picks}


def test_tiers():
    picks = by_artist(run_scoring([
        ev(["Big Thief", "Tiny Newcomer"]),
        ev(["Mid Band"]),
        ev(["Tag Only Kid"]),
        ev(["Heard Once"]),
    ]))
    assert picks["Big Thief"].tier == "know"
    nbt = picks["Tiny Newcomer"]
    assert nbt.tier == "next_big_thing"
    assert any("similar to Big Thief" in r for r in nbt.reasons)
    assert any("sharing the bill with Big Thief" in r for r in nbt.reasons)
    assert picks["Mid Band"].tier == "would_like"  # too big to be a next big thing
    assert picks["Tag Only Kid"].tier == "next_big_thing"
    assert any("tags match" in r for r in picks["Tag Only Kid"].reasons)
    assert "Heard Once" not in picks  # no similarity evidence


def test_out_of_town_only_for_loved_artists():
    picks = run_scoring([ev(["Big Thief", "Tiny Newcomer"], region="Buffalo")])
    assert [p.artist for p in picks] == ["Big Thief"]


def test_dedupe_keeps_earliest_and_counts_dates():
    picks = run_scoring([ev(["Big Thief"], day="2026-12-01"), ev(["Big Thief"], day="2026-11-01")])
    assert len(picks) == 1
    assert picks[0].event.starts_at.startswith("2026-11-01")
    assert "+1 more date nearby" in picks[0].reasons


def test_gather_events_assigns_regions_and_filters(monkeypatch):
    from nbt import pipeline

    class FakeBIT:
        app_id = "x"

        def city_events(self, region):
            raise NotImplementedError("pending")

        def artist_events(self, name):
            mk = lambda i, lat, lon, day: Event(f"bit:{name}{i}", f"{day}T20:00:00", Venue("V", "C", lat, lon), [name])
            return [
                mk(1, 43.66, -79.40, "2026-11-01"),  # Toronto
                mk(2, 42.89, -78.88, "2026-11-02"),  # Buffalo
                mk(3, 45.50, -73.57, "2026-11-03"),  # Montreal: out of range
                mk(4, 43.66, -79.40, "2027-06-01"),  # beyond lookahead
            ]

        def save(self):
            pass

    h = make_history()
    taste = Taste(h, FakeLastFM(), log=lambda *_: None)
    events = pipeline.gather_events(FakeBIT(), h, taste, date(2026, 10, 16), log=lambda *_: None)
    assert {(e.lineup[0], e.region) for e in events} >= {("Big Thief", "Toronto"), ("Big Thief", "Buffalo")}
    assert all(e.region in {"Toronto", "Buffalo"} for e in events)
    assert all(e.starts_at < "2027" for e in events)


def test_exclusions_file_parsing(tmp_path):
    from nbt import exclusions
    f = tmp_path / "exclude.txt"
    f.write_text("# header\nThe Wiggles\nKidz Bop  # the kids\n\n")
    assert exclusions.load(f) == {"wiggles", "kidz bop"}
    assert exclusions.load(tmp_path / "missing.txt") == set()


def test_kid_tags_ignore_low_weight_tags():
    from nbt.exclusions import kid_tags
    assert kid_tags({"children's music": 100, "pop": 80}) == ["children's music"]
    assert kid_tags({"kids": 5, "indie": 100}) == []


def test_excluded_artist_is_not_a_seed_or_a_pick():
    h = make_history()
    lfm = FakeLastFM()
    excluded = {"big thief"}
    taste = Taste(h, lfm, log=lambda *_: None, excluded=excluded)
    assert "big thief" not in taste.known and "big thief" not in taste.seeds
    assert "tiny newcomer" not in taste.forward  # only reachable via the excluded seed
    picks = score_events([ev(["Big Thief", "Tiny Newcomer"])], h, hist.loved(h, excluded=excluded),
                         taste.affinity, lfm.artist_info, velocity=lambda k, n: None,
                         regions={"Toronto": "all"}, cfg=Config(), excluded=excluded)
    names = {p.artist for p in picks}
    assert "Big Thief" not in names


def test_affinity_is_bounded_and_does_not_saturate_on_hubs():
    h = hist.empty_history()
    seeds = [f"Seed {i}" for i in range(20)]
    hist.ingest(h, [{"artist": s, "uts": uts(2010 + d, 1, 1 + i)} for i, s in enumerate(seeds) for d in range(5)])

    class HubLastFM(FakeLastFM):
        def similar(self, name):
            k = normalize_name(name)
            if k.startswith("seed"):
                return [("Hub Band", 0.6)] + ([("Niche Band", 0.95)] if k == "seed 0" else [])
            return []

    taste = Taste(h, HubLastFM(), log=lambda *_: None)
    hub, _ = taste.affinity("Hub Band")      # weak link from all 20 seeds
    niche, _ = taste.affinity("Niche Band")  # one strong link
    assert 0 < hub < 1 and 0 < niche < 1
    assert hub < 0.65  # 20 weak links no longer pin it at 1.0


def test_alias_pages_are_detected():
    class AliasLastFM(FakeLastFM):
        INFO = {**FakeLastFM.INFO, "michael jackson": 5_000_000}

        def artist_info(self, name):
            if name == "マイケル・ジャクソン":
                return {"name": name, "listeners": 14_000}
            if name == "Old Spelling":
                return {"name": "New Spelling", "listeners": 900}
            return super().artist_info(name)

        def similar(self, name):
            if name == "マイケル・ジャクソン":
                return [("Michael Jackson", 0.97)]
            if name == "Deb Talan":
                return [("Big Thief", 0.99)]
            return super().similar(name)

    taste = Taste(make_history(), AliasLastFM(), log=lambda *_: None)
    assert taste.looks_like_alias("マイケル・ジャクソン")
    assert taste.looks_like_alias("Old Spelling")          # Last.fm autocorrects it
    assert not taste.looks_like_alias("Tiny Newcomer")
    assert not taste.looks_like_alias("Deb Talan")         # Latin-script side project: keep
