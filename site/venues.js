// Renders site/data/venue_research.json (written by research/venue_overlap.py).
// Capacities for Toronto rooms come from data/toronto_capacity.json, keyed by
// lowercased setlist.fm venue name: a number, or a label ("Arena", "Festival") for
// spaces too big or too variable to give one, which count as large.

const MIN_ARTISTS = 10; // rooms with fewer distinct artists are too thin to rank
const MIN_OVERLAP = 3;
const LARGE = 1000;
const MIN_PAIR = 5; // twin-room pairings need this many shared artists…
const MIN_PAIR_ARTISTS = 20; // …at a Toronto room with at least this many artists
const SMALL_LISTENERS = 250000; // "next big thing" territory for the comeback list
const LADDER_MAX = 3000; // bigger rooms (arenas, stadiums) are usually support slots

// Moving up: a later Toronto show in a club or theatre at least 25% bigger than the
// first room. Arena and stadium dates are left out, since a small band there is almost
// always opening for someone else.
const movingUp = (a) => {
  const caps = a.shows.map((s) => s.cap).filter((c) => c && c <= LADDER_MAX);
  const first = a.shows[0].cap;
  return !!first && first <= LADDER_MAX && caps.slice(1).some((c) => c >= first * 1.25);
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const pct = (x) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const fmt = (n) => n.toLocaleString();
const capLabel = (c) => (c == null ? "—" : typeof c === "string" ? c : fmt(c));

function table(head, rows, numeric = []) {
  const wrap = el("div", "ledger-wrap");
  const t = el("table");
  const tr = el("tr");
  head.forEach((h, i) => tr.append(el("th", numeric.includes(i) ? "num" : null, h)));
  const thead = el("thead");
  thead.append(tr);
  t.append(thead);
  const body = el("tbody");
  for (const r of rows) {
    const row = el("tr");
    r.forEach((v, i) => {
      const td = el("td", numeric.includes(i) ? "num" : null);
      if (v instanceof Node) td.append(v); else td.textContent = v;
      row.append(td);
    });
    body.append(row);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}

function section(title, intro) {
  const s = el("section", "rsec");
  s.append(el("h2", null, title));
  if (intro) s.append(el("p", "muted", intro));
  return s;
}

// Venue name with its shared artists tucked into a disclosure.
function venueCell(v) {
  if (!v.overlap_artists.length) return el("span", null, v.name);
  const d = el("details", "artists");
  d.append(el("summary", null, v.name));
  d.append(el("p", null, v.overlap_artists.join(" · ")));
  return d;
}

function topLinks(by) {
  return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, c]) => `${n} ${c}`).join(", ") || "—";
}

function torontoTable(rows, cap) {
  return table(
    ["Venue", "Cap.", "Artists", "Shared", "Share", "vs avg", "Most shared with"],
    rows.map((v) => [
      venueCell(v),
      capLabel(cap(v)),
      fmt(v.artists),
      fmt(v.overlap),
      pct(v.share),
      v.lift != null ? `${v.lift.toFixed(1)}×` : "—",
      topLinks(v.by_sf_venue),
    ]),
    [1, 2, 3, 4, 5],
  );
}

async function load() {
  const report = document.getElementById("report");
  const [data, caps] = await Promise.all([
    fetch("data/venue_research.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("data/toronto_capacity.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  report.replaceChildren();
  if (!data) return report.append(el("p", "empty", "No research results yet."));
  const cap = (v) => caps[v.name.toLowerCase()] ?? null;
  const since = new Date(`${data.since}T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });

  const head = el("p", "muted");
  head.textContent =
    `setlist.fm shows since ${since} · ${fmt(data.sf_artists)} artists at your SF rooms · ` +
    `${fmt(data.toronto.artists)} artists across ${fmt(data.toronto.venues)} Toronto venues · ` +
    `${fmt(data.shared_artists_count)} played both · ` +
    `on average ${pct(data.baseline)} of a Toronto room's artists also played your SF rooms` +
    (data.complete ? "" : " · incomplete: setlist.fm's daily limit cut the run short");
  report.append(head);

  // SF rooms
  const sf = section("Your San Francisco rooms");
  sf.append(table(
    ["Venue", "Cap.", "Shows", "Artists"],
    data.sf_venues.map((v) => [v.name + (v.larger ? " (larger)" : ""), v.capacity, fmt(v.shows), fmt(v.artists)]),
    [2, 3],
  ));
  report.append(sf);

  // Twin rooms: for each SF room, the Toronto rooms whose lineups lean hardest toward
  // that room's artists, relative to how often its artists turn up in Toronto at all.
  const reach = {};
  for (const a of data.shared_artists) for (const s of a.sf) reach[s] = (reach[s] || 0) + 1;
  const twins = section(
    "Closest Toronto room for each SF room",
    `"Reach" is the share of the SF room's artists who played Toronto at all. Each Toronto room shows ` +
    `its shared artists and how much more it leans toward that SF room than a typical Toronto room ` +
    `(at least ${MIN_PAIR} shared, from rooms with ${MIN_PAIR_ARTISTS}+ artists).`,
  );
  twins.append(table(
    ["SF room", "Reach", "Closest Toronto rooms"],
    data.sf_venues.map((s) => {
      const base = (reach[s.name] || 0) / data.toronto.artists;
      const best = data.toronto_venues
        .map((v) => ({ v, k: v.by_sf_venue[s.name] || 0 }))
        .filter(({ v, k }) => k >= MIN_PAIR && v.artists >= MIN_PAIR_ARTISTS)
        .map((x) => ({ ...x, lift: x.k / x.v.artists / base }))
        .sort((a, b) => b.lift - a.lift)
        .slice(0, 3);
      const list = el("ul", "twins");
      for (const { v, k, lift } of best) {
        const c = cap(v);
        list.append(el("li", null, `${v.name}${c != null ? ` (${capLabel(c)})` : ""} · ${k} shared · ${lift.toFixed(1)}×`));
      }
      return [`${s.name} (${s.capacity})`, pct((reach[s.name] || 0) / s.artists), best.length ? list : "—"];
    }),
    [1],
  ));
  report.append(twins);

  // Toronto rooms, ranked by lift over the average room
  const rankable = data.toronto_venues.filter((v) => v.artists >= MIN_ARTISTS && v.overlap >= MIN_OVERLAP);
  rankable.sort((a, b) => b.lift - a.lift || b.overlap - a.overlap);
  const isLarge = (v) => typeof cap(v) === "string" || cap(v) > LARGE;
  const small = rankable.filter((v) => !isLarge(v));
  const large = rankable.filter(isLarge);
  const intro =
    `Ranked by "vs avg": the share of a room's artists who also played your SF rooms, compared with ` +
    `the Toronto average. 2× means twice as much overlap as a typical room. Rooms need at least ` +
    `${MIN_ARTISTS} artists and ${MIN_OVERLAP} shared to be ranked. Tap a venue for the shared artists.`;
  const s1 = section("Toronto rooms up to ~1,000", intro);
  s1.append(small.length ? torontoTable(small, cap) : el("p", "empty", "None met the thresholds."));
  report.append(s1);
  const s2 = section("Larger Toronto rooms");
  s2.append(large.length ? torontoTable(large, cap) : el("p", "empty", "None met the thresholds."));
  report.append(s2);

  // Momentum: shared artists who came back to Toronto, smallest-first filter by listeners
  const repeat = data.repeat_artists || [];
  if (repeat.length) {
    const small = repeat.filter((a) => a.listeners != null && a.listeners < SMALL_LISTENERS);
    const up = small.filter(movingUp);
    const f = document.getElementById("momentum-finding");
    if (f) {
      f.innerHTML = "";
      f.append(el("strong", null, "Momentum: "),
        `${fmt(repeat.length)} of the ${fmt(data.shared_artists_count)} shared artists came back to Toronto at least twice. ` +
        `${fmt(small.length)} of them have under ${fmt(SMALL_LISTENERS)} Last.fm listeners, and ${fmt(up.length)} of those ` +
        "moved up to a bigger Toronto room. Those are the strongest next-big-thing candidates here (below).");
      f.hidden = false;
    }
    const s = section(
      "Coming back to Toronto",
      `Artists from your SF rooms with 2+ Toronto visits since ${since} (visits 30+ days apart, so a multi-night run counts once). ` +
      `"Moving up" means a later Toronto show was in a club or theatre at least 25% bigger than their first. Arena and stadium dates don't count, since they're usually support slots. ` +
      `Showing artists under ${fmt(SMALL_LISTENERS)} Last.fm listeners; bigger ones are in the second list.`,
    );
    const shows = (a) => {
      const list = el("ul", "shows");
      for (const sh of a.shows) {
        const when = new Date(`${sh.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
        list.append(el("li", null, `${when} · ${sh.venue}${sh.cap ? ` (${fmt(sh.cap)})` : ""}`));
      }
      return list;
    };
    const name = (a) => {
      const n = el("span", null, a.artist);
      if (movingUp(a)) n.append(" ", el("span", "up", "↑ Moving up"));
      return n;
    };
    const rows = (list) => list.map((a) => [name(a), a.listeners != null ? fmt(a.listeners) : "—", fmt(a.visits), shows(a), a.sf.join(", ")]);
    const head = ["Artist", "Listeners", "Visits", "Toronto shows", "SF rooms"];
    const order = (list) => [...list].sort((x, y) => movingUp(y) - movingUp(x) || y.visits - x.visits || x.artist.localeCompare(y.artist));
    s.append(small.length ? table(head, rows(order(small)), [1, 2]) : el("p", "empty", "None under the listener cap."));
    const rest = repeat.filter((a) => !small.includes(a));
    if (rest.length) {
      const d = el("details", "all");
      d.append(el("summary", null, `Bigger artists who came back (${fmt(rest.length)})`));
      d.append(table(head, rows(order(rest)), [1, 2]));
      s.append(d);
    }
    report.append(s);
  }

  // Shared artists
  const s3 = section("Artists who played both", `${fmt(data.shared_artists.length)} artists, A to Z.`);
  const d = el("details", "all");
  d.append(el("summary", null, "Show the list"));
  d.append(table(["Artist", "SF rooms", "Toronto rooms"], data.shared_artists.map((a) => [a.artist, a.sf.join(", "), a.toronto.join(", ")])));
  s3.append(d);
  report.append(s3);

  const foot = el("p", "muted small");
  foot.textContent = `Data pulled ${new Date(data.generated_at).toLocaleString()} from setlist.fm (${fmt(data.requests)} API calls this run). ` +
    "Coverage depends on fans entering setlists, so small rooms and openers are under-counted.";
  report.append(foot);
}

load();
