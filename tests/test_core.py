from datetime import date, datetime, timezone

from nbt import history as hist
from nbt.config import Config
from nbt.models import Event, Venue, haversine_km, normalize_name
from nbt.scoring import calendar, score_events, smallness, venue_bonus
from nbt.snapshots import save_listeners, velocity
from nbt.sources.ticketmaster import _parse_event as parse_tm_event
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


def test_parse_tm_event():
    ev = parse_tm_event({
        "id": "tm001", "name": "Hovvdy", "url": "https://x",
        "dates": {"start": {"localDate": "2026-11-09", "localTime": "20:00:00"}},
        "_embedded": {
            "venues": [{"id": "KovZpZAdt7JA", "name": "Horseshoe Tavern",
                        "city": {"name": "Toronto"},
                        "location": {"latitude": "43.649", "longitude": "-79.401"}}],
            "attractions": [{"name": "Hovvdy"}, {"name": "Christian Lee Hutson"}],
        },
    })
    assert ev.id == "tm:tm001"
    assert ev.starts_at == "2026-11-09T20:00:00"
    assert ev.venue.name == "Horseshoe Tavern"
    assert ev.venue.capacity == 400
    assert ev.lineup == ["Hovvdy", "Christian Lee Hutson"]
    assert ev.source == "ticketmaster"


def test_parse_tm_event_no_attractions_falls_back_to_event_name():
    ev = parse_tm_event({
        "id": "tm002", "name": "Solo Act",
        "dates": {"start": {"localDate": "2026-11-10", "localTime": "21:00:00"}},
        "_embedded": {"venues": [{"id": "KovZ917AqfB", "name": "The Baby G",
                                   "city": {"name": "Toronto"},
                                   "location": {"latitude": "43.65", "longitude": "-79.43"}}]},
    })
    assert ev.lineup == ["Solo Act"]
    assert ev.venue.capacity == 200


def test_venue_bonus():
    from nbt.scoring import VENUE_BONUS_MAX, VENUE_BONUS_THRESHOLD
    assert venue_bonus(None) == 0.0
    assert venue_bonus(VENUE_BONUS_THRESHOLD) == 0.0
    assert venue_bonus(VENUE_BONUS_THRESHOLD + 1) == 0.0
    assert venue_bonus(0) == VENUE_BONUS_MAX
    assert venue_bonus(200) > venue_bonus(700) > venue_bonus(1400) > 0


def test_venue_bonus_appears_in_nbt_score_and_reason():
    small_venue_ev = Event(
        id="e1", starts_at="2026-11-01T20:00:00",
        venue=Venue("Baby G", "Toronto", 43.65, -79.43, capacity=200),
        lineup=["Tiny Newcomer"], region="Toronto",
    )
    large_venue_ev = Event(
        id="e2", starts_at="2026-11-01T20:00:00",
        venue=Venue("Scotiabank", "Toronto", 43.64, -79.38, capacity=19800),
        lineup=["Tiny Newcomer"], region="Toronto",
    )
    picks_small = by_artist(run_scoring([small_venue_ev]))
    picks_large = by_artist(run_scoring([large_venue_ev]))
    assert picks_small["Tiny Newcomer"].score > picks_large["Tiny Newcomer"].score
    assert any("small venue" in r for r in picks_small["Tiny Newcomer"].reasons)
    assert not any("small venue" in r for r in picks_large["Tiny Newcomer"].reasons)


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


_TEST_LOVES = {"big thief", "adrianne lenker"}  # pin test seeds to bypass recency decay


def run_scoring(events, cfg=Config(lastfm_user="u", lastfm_api_key="k")):
    h = make_history()
    lfm = FakeLastFM()
    taste = Taste(h, lfm, log=lambda *_: None, loves=_TEST_LOVES)
    return score_events(events, h, hist.loved(h, loves=_TEST_LOVES), taste.affinity, lfm.artist_info,
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


def test_calendar_keeps_every_show_and_act():
    h = make_history()
    lfm = FakeLastFM()
    taste = Taste(h, lfm, log=lambda *_: None, loves=_TEST_LOVES)
    rows = calendar([ev(["Heard Once"], day="2026-11-02"), ev(["Big Thief", "Tiny Newcomer"])],
                    h, taste.affinity, lfm.artist_info, excluded={"tiny newcomer"})
    assert [r["acts"][0]["artist"] for r in rows] == ["Big Thief", "Heard Once"]  # by date
    big, tiny = rows[0]["acts"]
    assert big["days"] == 10 and big["listeners"] == 900_000
    assert tiny == {"artist": "Tiny Newcomer", "skipped": True}
    once = rows[1]["acts"][0]
    assert once["affinity"] == 0 and once["days"] == 1  # no pick, but still on the calendar


def test_out_of_town_only_for_loved_artists():
    picks = run_scoring([ev(["Big Thief", "Tiny Newcomer"], region="Buffalo")])
    assert [p.artist for p in picks] == ["Big Thief"]


def test_loved_blends_rotation_heavy_rotation_and_loves():
    h = hist.empty_history()
    plays = [{"artist": "Old Favourite", "uts": uts(2005 + i, 1, 1)} for i in range(15)]  # last 2019
    plays += [{"artist": "Still Around", "uts": uts(2010 + i, 1, 1, h=21)} for i in range(10)]
    plays += [{"artist": "Still Around", "uts": uts(2025, 5, 1)}]
    plays += [{"artist": "New Obsession", "uts": uts(2025, 1, 1 + i)} for i in range(8)]
    plays += [{"artist": "Dabbling", "uts": uts(2025, 2, 1 + i)} for i in range(7)]
    hist.ingest(h, sorted(plays, key=lambda p: p["uts"]))
    today = date(2026, 10, 26)
    loved = hist.loved(h, top_n=2, excluded=set(), loves=set(), today=today)
    # Top 2 by days: Old Favourite (not played since 2019, out) and Still Around (in).
    # New Obsession has 8 recent days (in); Dabbling has 7 and isn't top 2 (out).
    assert loved == {"still around", "new obsession"}
    assert "old favourite" in hist.loved(h, top_n=2, excluded=set(), loves={"Old Favourite"}, today=today)


def test_out_of_town_attended_artist_needs_no_play_days():
    h = make_history()
    lfm = FakeLastFM()
    taste = Taste(h, lfm, log=lambda *_: None, loves=_TEST_LOVES)
    picks = score_events([ev(["Seen Once Live", "Tiny Newcomer"], region="Buffalo")], h,
                         {"seen once live"}, taste.affinity, lfm.artist_info, velocity=lambda k, n: None,
                         regions={"Buffalo": "loved"}, excluded=set())
    assert [(p.artist, p.tier, p.reasons) for p in picks] == [("Seen Once Live", "know", ["you've seen them live"])]


def test_dedupe_keeps_earliest_and_counts_dates():
    picks = run_scoring([ev(["Big Thief"], day="2026-12-01"), ev(["Big Thief"], day="2026-11-01")])
    assert len(picks) == 1
    assert picks[0].event.starts_at.startswith("2026-11-01")
    assert "+1 more date nearby" in picks[0].reasons


def test_gather_events_assigns_regions_and_filters(monkeypatch):
    from nbt import pipeline

    class FakeTM:
        def __init__(self):
            self.asked = []

        def city_events(self, region):
            self.asked.append(region.name)
            mk = lambda i, lat, lon, day: Event(f"tm:{region.name}{i}", f"{day}T20:00:00", Venue("V", "C", lat, lon), ["Big Thief"])
            return [
                mk(1, 43.66, -79.40, "2026-11-01"),  # Toronto
                mk(2, 42.89, -78.88, "2026-11-02"),  # Buffalo
                mk(3, 45.50, -73.57, "2026-11-03"),  # Montreal: out of range
                mk(4, 43.66, -79.40, "2027-06-01"),  # beyond lookahead
            ]

        def save(self):
            pass

    tm = FakeTM()
    events = pipeline.gather_events(tm, date(2026, 10, 16), log=lambda *_: None)
    # Every region is fetched, out-of-town ones included (scoring keeps only loved bands there).
    assert tm.asked == [r.name for r in pipeline.CONFIG.regions]
    assert {e.region for e in events} == {"Toronto", "Buffalo"}
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
    assert kid_tags({"video game music": 60, "electronic": 100}) == []   # review only
    assert kid_tags({"fnaf": 50}) == ["fnaf"] and kid_tags({"vocaloid": 80}) == ["vocaloid"]


def test_game_tags_are_review_only():
    from nbt.exclusions import game_tags
    assert game_tags({"video game music": 60, "orchestral": 90}) == ["video game music"]


def test_excluded_artist_is_not_a_seed_or_a_pick():
    h = make_history()
    lfm = FakeLastFM()
    excluded = {"big thief"}
    taste = Taste(h, lfm, log=lambda *_: None, excluded=excluded, loves=_TEST_LOVES)
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

    taste = Taste(h, HubLastFM(), log=lambda *_: None, loves=_TEST_LOVES)
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

    taste = Taste(make_history(), AliasLastFM(), log=lambda *_: None, loves=_TEST_LOVES)
    assert taste.looks_like_alias("マイケル・ジャクソン")
    assert taste.looks_like_alias("Old Spelling")          # Last.fm autocorrects it
    assert not taste.looks_like_alias("Tiny Newcomer")
    assert not taste.looks_like_alias("Deb Talan")         # Latin-script side project: keep


def test_normalize_name_keeps_non_latin_scripts():
    assert normalize_name("マイケル・ジャクソン") == "マイケル ジャクソン"
    assert normalize_name("Кино") == "кино"
    assert normalize_name("マイケル・ジャクソン") != normalize_name("宇多田ヒカル")
    assert normalize_name("Sigur Rós") == "sigur ros"


def test_symbol_only_names_do_not_collide():
    assert normalize_name("†††") == "†††"
    assert normalize_name("†††") != normalize_name("!!!")


def test_keep_lines_are_not_excluded(tmp_path):
    from nbt import exclusions
    f = tmp_path / "exclude.txt"
    f.write_text("Kidz Bop\n+ Selena Gomez  # mine\n")
    assert exclusions.load(f) == {"kidz bop"}
    assert exclusions.load_keeps(f) == {"selena gomez"}


def test_kids_tagged_unknown_artist_is_never_picked():
    class KidsLastFM(FakeLastFM):
        TAGS = {**FakeLastFM.TAGS, "tiny newcomer": {"children's music": 90}}

    h = make_history()
    lfm = KidsLastFM()
    taste = Taste(h, lfm, log=lambda *_: None, loves=_TEST_LOVES)
    picks = score_events([ev(["Big Thief", "Tiny Newcomer"])], h, hist.loved(h), taste.affinity,
                         lfm.artist_info, velocity=lambda k, n: None, regions={"Toronto": "all"},
                         is_noise=taste.is_noise)
    assert {p.artist for p in picks} == {"Big Thief"}


def test_effective_exclusions_auto_exclude_kids_tags_but_honour_keeps(tmp_path, monkeypatch):
    from nbt import exclusions
    f = tmp_path / "exclude.txt"
    f.write_text("Manual Kid\n+ Kept Kid\n")
    monkeypatch.setattr(exclusions, "EXCLUDE_PATH", f)
    monkeypatch.setattr(exclusions.load, "__defaults__", (f,))
    monkeypatch.setattr(exclusions.load_keeps, "__defaults__", (f,))

    class TagLastFM:
        TAGS = {"Tagged Kid": {"children's music": 90}, "Kept Kid": {"roblox": 90},
                "Game Composer": {"video game music": 90}}

        def top_tags(self, name):
            return self.TAGS.get(name, {})

    h = hist.empty_history()
    names = ["Tagged Kid", "Kept Kid", "Game Composer", "Manual Kid", "Grown Up"]
    hist.ingest(h, [{"artist": n, "uts": uts(2015 + d, 1, 1 + i)} for i, n in enumerate(names) for d in range(3)])
    excluded, auto = exclusions.effective(h, TagLastFM(), min_days=3)
    assert set(auto) == {"tagged kid"}
    assert excluded == {"tagged kid", "manual kid"}


# ---------------------------------------------------------------------------
# setlist.fm integration
# ---------------------------------------------------------------------------

def test_attended_artists_boost_taste_seeds():
    """An attended artist not in known history is injected as a seed."""
    h = make_history()
    lfm = FakeLastFM()
    # "Live Only Band" was never scrobbled but seen live; assume it's similar to Tiny Newcomer
    class LiveLastFM(FakeLastFM):
        SIMILAR = {
            **FakeLastFM.SIMILAR,
            "live only band": [("Tiny Newcomer", 0.95)],
        }

    taste = Taste(h, LiveLastFM(), log=lambda *_: None, attended={"live only band": "Live Only Band"})
    assert "live only band" in taste.seeds
    # Tiny Newcomer should have affinity via the attended seed
    aff, reasons = taste.affinity("Tiny Newcomer")
    assert aff > 0


def test_attended_artists_do_not_override_known_weight():
    """An attended artist already in known keeps its scrobble-derived seed weight."""
    h = make_history()
    lfm = FakeLastFM()
    taste_no_att = Taste(h, lfm, log=lambda *_: None, loves=_TEST_LOVES)
    taste_with_att = Taste(h, lfm, log=lambda *_: None, loves=_TEST_LOVES, attended={"big thief": "Big Thief"})
    # Weight should be unchanged (attended weight is lower than a 10-day listen habit)
    assert taste_no_att.weights.get("big thief") == taste_with_att.weights.get("big thief")


def test_venue_novelty_reason_added_for_new_venue():
    h = make_history()
    lfm = FakeLastFM()
    taste = Taste(h, lfm, log=lambda *_: None, loves=_TEST_LOVES)
    new_venue_ev = Event(
        id="enew", starts_at="2026-11-01T20:00:00",
        venue=Venue("Brand New Room", "Toronto"),
        lineup=["Tiny Newcomer"], region="Toronto",
    )
    picks = score_events(
        [new_venue_ev], h, hist.loved(h), taste.affinity, lfm.artist_info,
        velocity=lambda k, n: None, regions={"Toronto": "all"},
        attended_venues={"some other venue"},  # Brand New Room not in attended
    )
    nbt = [p for p in picks if p.tier == "next_big_thing" and p.artist == "Tiny Newcomer"]
    assert nbt and any("never been to" in r for r in nbt[0].reasons)


def test_venue_novelty_reason_not_added_for_known_venue():
    h = make_history()
    lfm = FakeLastFM()
    taste = Taste(h, lfm, log=lambda *_: None, loves=_TEST_LOVES)
    # TM calls it "The Horseshoe Tavern"; setlist.fm logged it as "horseshoe tavern"
    familiar_ev = Event(
        id="efam", starts_at="2026-11-01T20:00:00",
        venue=Venue("The Horseshoe Tavern", "Toronto"),
        lineup=["Tiny Newcomer"], region="Toronto",
    )
    picks = score_events(
        [familiar_ev], h, hist.loved(h), taste.affinity, lfm.artist_info,
        velocity=lambda k, n: None, regions={"Toronto": "all"},
        attended_venues={"horseshoe tavern"},  # setlist.fm short form matches TM "The …" form
    )
    nbt = [p for p in picks if p.tier == "next_big_thing" and p.artist == "Tiny Newcomer"]
    assert nbt and not any("never been to" in r for r in nbt[0].reasons)


def test_venue_novelty_city_suffix_variant():
    from nbt.scoring import _venue_attended
    # "History Toronto" (TM) vs "history" (setlist.fm)
    assert _venue_attended("History Toronto", {"history"})
    assert _venue_attended("The Danforth Music Hall", {"danforth music hall"})
    assert not _venue_attended("Massey Hall", {"roy thomson hall"})


def test_attended_ledger_includes_listener_counts():
    from nbt.sources.setlistfm import SetlistFM
    import unittest.mock as mock

    slm = SetlistFM.__new__(SetlistFM)
    slm._raw_attended = [
        {"artist": {"name": "Guster"}, "eventDate": "07-12-1995",
         "venue": {"name": "Iron Horse Music Hall", "city": {"name": "Northampton"}}},
        {"artist": {"name": "Ani DiFranco"}, "eventDate": "04-02-1993",
         "venue": {"name": "Iron Horse Music Hall", "city": {"name": "Northampton"}}},
    ]
    with mock.patch.object(slm, "attended", return_value=slm._raw_attended):
        rows = slm.attended_ledger(current_listeners={"guster": 123_456, "ani difranco": 890_000})
    assert rows[0] == {"artist": "Guster", "date": "07-12-1995",
                       "venue": "Iron Horse Music Hall", "city": "Northampton",
                       "listeners_now": 123_456}
    assert rows[1]["listeners_now"] == 890_000


def test_lastfm_lookups_use_straight_quotes_and_a_fresh_cache_key(tmp_path, monkeypatch):
    from nbt import lastfm as lf

    monkeypatch.setattr(lf, "DATA_DIR", tmp_path)
    client = lf.LastFM(api_key="x")
    asked = []
    client.call = lambda method, **p: asked.append(p["artist"]) or None
    # A wrong answer cached before the fix, under the quote-less key both spellings share.
    client.info_cache.set(lf.normalize_name("Arm’s Length"), {"name": "Arm’s Length", "listeners": 12})
    assert client.artist_info("Arm’s Length") is None  # refetched, not the stale entry
    assert asked and set(asked) == {"Arm's Length"}  # getinfo (and search) use straight quotes
    assert lf.cache_key("Arm’s Length") == lf.cache_key("Arm's Length") == "q:" + lf.normalize_name("Arm's Length")
    assert lf.cache_key("Big Thief") == "big thief"


def test_attended_is_fetched_fresh_each_run_and_once_per_run(tmp_path, monkeypatch):
    from nbt.sources import setlistfm as sf

    monkeypatch.setattr(sf, "DATA_DIR", tmp_path)
    calls = []

    class Resp:
        status_code = 200

        def __init__(self, shows):
            self._shows = shows

        def raise_for_status(self):
            pass

        def json(self):
            return {"setlist": self._shows, "total": len(self._shows), "itemsPerPage": 20}

    logged = [[{"artist": {"name": "Beck"}}]]
    monkeypatch.setattr(sf.requests, "get", lambda *a, **k: calls.append(1) or Resp(logged[0]))

    run1 = sf.SetlistFM(api_key="x")
    assert len(run1.attended("quepol")) == 1
    run1.attended("quepol")  # artists, venues and the ledger all ask; one fetch per run
    assert len(calls) == 1
    run1.save()

    logged[0] = logged[0] + [{"artist": {"name": "Weezer"}}]  # a show logged overnight
    run2 = sf.SetlistFM(api_key="x")  # next day's run, same on-disk cache
    assert len(run2.attended("quepol")) == 2


def test_seed_weight_prefers_depth_over_one_song_on_shuffle():
    from nbt.taste import depth

    one_song = {"days": 26, "plays": 26}      # Gary Jules: "Mad World" on shuffle
    album_deep = {"days": 24, "plays": 110}   # The Civil Wars
    binge = {"days": 2, "plays": 228}         # one weekend on repeat
    assert depth(album_deep) > depth(one_song) > depth(binge)



def test_stylised_names_resolve_to_the_real_artist(tmp_path, monkeypatch):
    from nbt import lastfm as lf

    monkeypatch.setattr(lf, "DATA_DIR", tmp_path)
    client = lf.LastFM(api_key="x")
    pages = {"half alive": 1_141, "half•alive": 1_050_000, "tiny band": 2_400}

    def call(method, **p):
        if method == "artist.getinfo":
            n = p["artist"]
            return {"artist": {"name": n, "stats": {"listeners": pages[n], "playcount": 1}}} if n in pages else None
        matches = [{"name": n, "listeners": str(v)} for n, v in pages.items()
                   if lf.normalize_name(n) == lf.normalize_name(p["artist"])]
        return {"results": {"artistmatches": {"artist": matches}}}

    client.call = call
    assert client.artist_info("half alive")["listeners"] == 1_050_000  # not the near-empty page
    assert client.artist_info("tiny band")["listeners"] == 2_400  # genuinely small stays small
    # A wrong small answer cached before the check gets re-checked once.
    client.info_cache.set(lf.cache_key("half alive"), {"name": "half alive", "listeners": 1_141})
    assert client.artist_info("half alive")["listeners"] == 1_050_000


def test_bands_table_lists_travel_seeds_and_dropped_favourites():
    from nbt import bands
    h = hist.empty_history()
    plays = [{"artist": "Old Favourite", "uts": uts(2005 + i, 1, 1)} for i in range(15)]  # last 2019
    plays += [{"artist": "New Obsession", "uts": uts(2025, 1, 1 + i)} for i in range(8)]
    hist.ingest(h, sorted(plays, key=lambda p: p["uts"]))
    today = date(2026, 10, 26)
    why = hist.travel_reasons(h, excluded=set(), loves=set(), today=today)
    why["seen live"] = ["live"]
    rows = {r["artist"]: r for r in bands.table(h, why, ["new obsession"], {"new obsession": 0.5},
                                                  {"seen live": "Seen Live"}, set(), today)}
    assert rows["Old Favourite"]["travel"] == [] and rows["Old Favourite"]["top"] == 1  # dropped off
    assert rows["New Obsession"] == {"artist": "New Obsession", "days": 8, "plays": 8, "recent": 8,
                                     "last": "2025-01-08", "top": 2, "travel": ["rotation", "heavy"],
                                     "seed": 1, "weight": 0.5}
    assert rows["Seen Live"]["travel"] == ["live"] and rows["Seen Live"]["days"] == 0
