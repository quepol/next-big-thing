// Renders site/data/venue_research.json (written by research/venue_overlap.py).
// Capacities for Toronto rooms come from data/toronto_capacity.json, keyed by
// lowercased setlist.fm venue name.

const MIN_ARTISTS = 10; // rooms with fewer distinct artists are too thin to rank
const MIN_OVERLAP = 3;
const LARGE = 1000;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const pct = (x) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const fmt = (n) => n.toLocaleString();

function table(head, rows, numeric = []) {
  const wrap = el("div", "ledger-wrap");
  const t = el("table");
  const tr = el("tr");
  head.forEach((h, i) => tr.append(el("th", numeric.includes(i) ? "num" : null, h)));
  t.append(el("thead")).firstChild.append(tr);
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
      cap(v) ? fmt(cap(v)) : "—",
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

  // Toronto rooms, ranked by lift over the average room
  const rankable = data.toronto_venues.filter((v) => v.artists >= MIN_ARTISTS && v.overlap >= MIN_OVERLAP);
  rankable.sort((a, b) => b.lift - a.lift || b.overlap - a.overlap);
  const small = rankable.filter((v) => !(cap(v) > LARGE));
  const large = rankable.filter((v) => cap(v) > LARGE);
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
