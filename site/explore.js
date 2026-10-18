// The Climb: an exploratory view of the venue research.
//   - The Climb: each band's Toronto shows over time, by room size (log scale), with the
//     user's aughts favourites as dashed "ghost" lines for pace when time is aligned.
//   - Your rooms: upcoming shows at followed Toronto rooms, ranked by taste + bonuses.
//   - Look up a band: its journey, billing, and whether the user has seen it.
//   - Room rivers: SF rooms → Toronto rooms, stream width = shared bands.
// Data: data/venue_research.json, data/toronto_capacity.json, data/ladder_study.json
// (optional) and data/digest.json (attended shows). Billing rules live in ladder.js.

const CAP_DOMAIN = [100, 20000];
const ALIGN_MAX_YEARS = 10; // aughts climbs run longer; the interesting part is the start
const RUNGS = [[250, "Monarch 250"], [700, "Lee's 700"], [1427, "Danforth 1,427"], [2765, "Massey 2,765"]];
const RIVER_MIN = 3; // streams with fewer shared bands are left out
const RIVER_ROOMS = 12;

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").normalize("NFKD").replace(/[^a-z0-9']+/g, " ").trim();
const parseDate = (iso) => new Date(`${iso}T12:00:00`);
const monthYear = (d) => d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
const firstNumber = (s) => Number(String(s).replace(/,/g, "").match(/\d+/)?.[0] || 0);
const short = (s, n = 17) => { s = s.replace(/^The /, ""); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

const state = {
  mode: store.get("nbt.climb.mode", "up"),
  sfroom: "",
  align: null, // set once we know whether ghost data exists
  selected: null,
};
let D = null; // loaded data

async function getJSON(url, fallback) {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

async function load() {
  const [research, caps, ladder, digest] = await Promise.all([
    getJSON("data/venue_research.json", null),
    getJSON("data/toronto_capacity.json", {}),
    getJSON("data/ladder_study.json", null),
    getJSON("data/digest.json", {}),
  ]);
  if (!research) {
    document.getElementById("chart").append(el("p", "empty", "No research data yet."));
    return;
  }
  setCaps(caps);
  const seen = new Map();
  for (const r of digest.attended_ledger || []) {
    const k = norm(r.artist);
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(r);
  }
  const repeat = new Map(research.repeat_artists.map((a) => [norm(a.artist), a]));
  const shared = new Map(research.shared_artists.map((a) => [norm(a.artist), a]));
  D = { research, ladder, seen, repeat, shared };
  state.align = "aligned"; // every band starts at 0, so lines fan out instead of crossing
  D.next = nextShows(digest);
  setupControls();
  renderPace();
  renderClimb();
  document.getElementById("chartwrap").addEventListener("toggle", (e) => { if (e.target.open) renderChart(); });
  setupLookup();
  setupRooms(digest);
  renderRivers();
  let w = document.getElementById("chart").clientWidth;
  window.addEventListener("resize", () => {
    const nw = document.getElementById("chart").clientWidth;
    if (nw !== w) { w = nw; renderClimb(); renderRivers(); }
  });
}

// ---------- The Climb ----------

function setupControls() {
  const seg = document.getElementById("mode");
  const paint = () => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.v === state.mode));
  paint();
  seg.addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (!v) return;
    state.mode = v;
    state.climbAll = false;
    store.set("nbt.climb.mode", v);
    paint();
    renderClimb();
  });
  const sf = document.getElementById("sfroom");
  for (const v of D.research.sf_venues) sf.append(new Option(v.name, v.name));
  sf.addEventListener("change", () => { state.sfroom = sf.value; renderClimb(); });
  const align = document.getElementById("align");
  align.value = state.align;
  if (!D.ladder?.bands?.length) align.querySelector('[value="aligned"]').textContent = "from first show (ghosts pending)";
  align.addEventListener("change", () => { state.align = align.value; renderChart(); });
}

function climbBands() {
  return D.research.repeat_artists.filter((a) => {
    if (state.sfroom && !a.sf.includes(state.sfroom)) return false;
    const small = a.listeners != null && a.listeners < SMALL_LISTENERS;
    if (state.mode === "up") return small && movingUp(a);
    if (state.mode === "small") return small;
    if (state.mode === "seen") return D.seen.has(norm(a.artist));
    return true;
  });
}

function renderChart() {
  const box = document.getElementById("chart");
  box.replaceChildren();
  const vertical = box.clientWidth < 600; // phone: time runs down the page
  const W = box.clientWidth;
  const H = vertical ? 640 : 440;
  const m = vertical ? { t: 26, r: 14, b: 12, l: 44 } : { t: 14, r: 96, b: 30, l: 74 };

  const bands = climbBands().map((a) => {
    const pts = a.shows.filter((sh) => typeof sh.cap === "number")
      .map((sh) => ({ date: parseDate(sh.date), cap: sh.cap, head: !isSupport(sh), sh }));
    const heads = pts.filter((p) => p.head);
    const t0 = (heads[0] || pts[0])?.date;
    return { a, pts, heads, t0 };
  }).filter((b) => b.pts.length);

  const aligned = state.align === "aligned";
  const years = (d, t0) => (d - t0) / (365.25 * 864e5);
  const ghosts = aligned ? (D.ladder?.bands || []).map((g) => {
    const pts = g.shows.filter((sh) => typeof sh.cap === "number").map((sh) => ({ date: parseDate(sh.date), cap: sh.cap }));
    return { name: g.artist, pts, t0: pts[0]?.date };
  }).filter((g) => g.pts.length > 1) : [];

  const tOf = (p, t0) => (aligned ? years(p.date, t0) : p.date);
  let tScale;
  if (aligned) {
    // As long as the longest band (or ghost) needs, up to ALIGN_MAX_YEARS.
    const span = d3.max([
      ...bands.map((b) => d3.max(b.pts, (p) => years(p.date, b.t0))),
      ...ghosts.map((g) => d3.max(g.pts, (p) => years(p.date, g.t0))),
    ]) || 1;
    tScale = d3.scaleLinear().domain([0, Math.min(Math.ceil(span), ALIGN_MAX_YEARS)]);
  } else {
    const all = bands.flatMap((b) => b.pts.map((p) => p.date));
    tScale = d3.scaleTime().domain(all.length ? d3.extent(all) : [new Date(), new Date()]).nice();
  }
  const cScale = d3.scaleLog().domain(CAP_DOMAIN).clamp(true);
  if (vertical) { tScale.range([m.t, H - m.b]); cScale.range([m.l, W - m.r]); }
  else { tScale.range([m.l, W - m.r]); cScale.range([H - m.b, m.t]); }
  const xy = (t, c) => (vertical ? [cScale(c), tScale(t)] : [tScale(t), cScale(c)]);

  const svg = d3.select(box).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "climbsvg")
    .attr("role", "img").attr("aria-label", "Room size of each Toronto show over time");

  // Ladder rungs
  const g0 = svg.append("g").attr("class", "rungs");
  for (const [c, label] of RUNGS) {
    const [x1, y1] = xy(tScale.domain()[0], c);
    const [x2, y2] = xy(tScale.domain()[1], c);
    g0.append("line").attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
    if (vertical) g0.append("text").attr("x", x1).attr("y", m.t - 8).attr("text-anchor", "middle").text(c >= 1000 ? `${(c / 1000).toFixed(1)}k` : c);
    else g0.append("text").attr("x", W - m.r + 6).attr("y", y1 + 4).text(label);
  }
  // Time axis
  const axis = (vertical ? d3.axisLeft(tScale) : d3.axisBottom(tScale)).ticks(vertical ? 6 : 7);
  if (aligned) axis.ticks(Math.min(tScale.domain()[1] * 2, 10)).tickFormat((v) => (v === 0 ? "first" : `+${d3.format("~g")(v)}y`));
  svg.append("g").attr("class", "axis")
    .attr("transform", vertical ? `translate(${m.l - 4},0)` : `translate(0,${H - m.b + 4})`)
    .call(axis);
  if (!vertical) {
    svg.append("text").attr("class", "axislabel").attr("transform", `translate(14,${H / 2}) rotate(-90)`)
      .attr("text-anchor", "middle").text("room size (log)");
  }

  // Ghosts: the aughts favourites, for pace
  const line = d3.line().x((d) => d[0]).y((d) => d[1]);
  // Steps: hold the room size, then jump. Along time first, whichever way time runs.
  const stair = d3.line().x((d) => d[0]).y((d) => d[1]).curve(vertical ? d3.curveStepBefore : d3.curveStepAfter);
  const gg = svg.append("g").attr("class", "ghosts");
  for (const g of ghosts) {
    const pts = g.pts.map((p) => xy(Math.min(years(p.date, g.t0), ALIGN_MAX_YEARS), p.cap));
    gg.append("path").attr("d", line(pts));
    const last = pts[pts.length - 1];
    gg.append("text").attr("x", last[0] + (vertical ? -4 : 4)).attr("y", last[1] + (vertical ? -6 : -4))
      .attr("text-anchor", vertical ? "end" : "start").text(g.name);
  }

  // Bands
  const gb = svg.append("g").attr("class", "bands");
  for (const b of bands) {
    const key = norm(b.a.artist);
    const grp = gb.append("g").attr("class", `band${movingUp(b.a) ? " up" : ""}`).attr("data-k", key);
    // The climb: best headline room so far, as a staircase that only steps up.
    let best = 0;
    const hp = b.heads.map((p) => { best = Math.max(best, p.cap); return xy(tOf(p, b.t0), best); });
    if (hp.length > 1) {
      grp.append("path").attr("class", "trail").attr("d", stair(hp));
      grp.append("path").attr("class", "hit").attr("d", stair(hp));
    }
    for (const p of b.pts) {
      const [x, y] = xy(tOf(p, b.t0), p.cap);
      grp.append("circle").attr("cx", x).attr("cy", y).attr("r", p.head ? 3 : 2.6).attr("class", p.head ? "head" : "supp");
    }
    grp.on("click", (e) => { e.stopPropagation(); select(b.a.artist, true); });
    grp.append("title").text(`${b.a.artist}${b.a.listeners != null ? ` · ${fmt(b.a.listeners)} listeners` : ""}`);
  }
  svg.on("click", () => select(null));

  const note = document.getElementById("chartnote");
  note.textContent = `${fmt(bands.length)} band${bands.length === 1 ? "" : "s"}. ` +
    "Lines step up when a band headlines a bigger room than before; dots are every show. " +
    (aligned ? "Each band starts at its first headline show in Toronto since Oct 2023. " : "") +
    (aligned && ghosts.length ? "Dashed lines are your aughts favourites, from their first Bay Area or Toronto show. " : "") +
    (aligned && !ghosts.length ? "Your aughts favourites appear as dashed lines once the ladder study finishes. " : "") +
    "Tap a line for details.";
  if (state.selected) highlight(state.selected);
}

// The list: one row per band, biggest climb first. The chart lives in a <details>
// and only renders when opened.
const SF_PACE_LADDER = [[700, "small room"], [2300, "Warfield size"]];
const CLIMB_LIMIT = 25;

function renderClimb() {
  renderList();
  if (document.getElementById("chartwrap").open) renderChart();
}

// Upcoming Toronto dates per artist, from the digest's calendar (or picks).
function nextShows(digest) {
  const { rows } = calendarRows(digest);
  const today = new Date().toISOString().slice(0, 10);
  const next = new Map();
  for (const r of rows) {
    if (r.starts_at.slice(0, 10) < today) continue;
    for (const a of r.acts) {
      const k = norm(a.artist);
      if (!next.has(k) || next.get(k).starts_at > r.starts_at) next.set(k, r);
    }
  }
  return next;
}

// A band's climb: its headline shows, and the steps where it beat its biggest room so far.
function climbOf(a) {
  const heads = a.shows.filter((sh) => !isSupport(sh) && typeof sh.cap === "number")
    .map((sh) => ({ ...sh, d: parseDate(sh.date) }));
  const steps = [];
  for (const h of heads) if (!steps.length || h.cap > steps[steps.length - 1].cap) steps.push(h);
  const first = steps[0], top = steps[steps.length - 1];
  const months = first && top ? (top.d - first.d) / (30.44 * 864e5) : 0;
  return { heads, steps, factor: first ? top.cap / first.cap : 1, months };
}

const spanText = (months) => (months < 1 ? "within a month" : months < 18 ? `in ${Math.round(months)} months` : `in ${(months / 12).toFixed(1)} years`);

// A tiny ladder: Toronto rungs as faint lines, the band's headline shows as dots over time.
function miniLadder(c) {
  const W = 72, H = 30;
  const y = (cap) => H - 3 - (Math.log(Math.min(Math.max(cap, 150), 3000) / 150) / Math.log(20)) * (H - 6);
  const t0 = c.heads[0]?.d, t1 = c.heads[c.heads.length - 1]?.d;
  const x = (d) => (t1 > t0 ? 3 + ((d - t0) / (t1 - t0)) * (W - 6) : W / 2);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "mini");
  svg.setAttribute("aria-hidden", "true");
  for (const [cap] of RUNGS) {
    const l = document.createElementNS(ns, "line");
    Object.entries({ x1: 0, x2: W, y1: y(cap), y2: y(cap) }).forEach(([k, v]) => l.setAttribute(k, v));
    svg.append(l);
  }
  let best = 0;
  const pts = c.heads.map((h) => { best = Math.max(best, h.cap); return `${x(h.d).toFixed(1)},${y(best).toFixed(1)}`; });
  if (pts.length > 1) {
    const pl = document.createElementNS(ns, "polyline");
    pl.setAttribute("points", pts.join(" "));
    svg.append(pl);
  }
  for (const h of c.heads) {
    const dot = document.createElementNS(ns, "circle");
    Object.entries({ cx: x(h.d), cy: y(h.cap), r: 2.2 }).forEach(([k, v]) => dot.setAttribute(k, v));
    svg.append(dot);
  }
  return svg;
}

function renderList() {
  const list = document.getElementById("climblist");
  list.replaceChildren();
  const rows = climbBands().map((a) => ({ a, c: climbOf(a) })).filter(({ c }) => c.heads.length)
    .sort((x, y) => (y.c.steps.length > 1) - (x.c.steps.length > 1) || y.c.factor - x.c.factor || x.c.months - y.c.months);
  document.getElementById("climbnote").textContent =
    `${fmt(rows.length)} band${rows.length === 1 ? "" : "s"}. Room sizes are Toronto headline shows since Oct 2023; support slots don't count.`;
  const shown = state.climbAll ? rows : rows.slice(0, CLIMB_LIMIT);
  for (const { a, c } of shown) {
    const li = el("li", "climb-row");
    const d = el("details");
    const sum = el("summary");
    const main = el("div", "cr-main");
    const name = el("div", "cr-name", a.artist);
    if (D.seen.has(norm(a.artist))) name.append(" ", el("span", "seenbadge", "★"));
    if (a.listeners != null) {
      const l = el("span", "cr-listeners", ` ${fmtListeners(a.listeners)}${a.listeners < SUSPECT_LISTENERS ? "?" : ""}`);
      if (a.listeners < SUSPECT_LISTENERS) l.title = "Last.fm may have matched a different artist with this name";
      name.append(l);
    }
    main.append(name);
    const path = c.steps.length > 1
      ? c.steps.map((h) => `${short(h.venue, 20)} ${fmt(h.cap)}`).join(" → ")
      : `Headlined ${short(c.steps[0].venue, 22)} (${fmt(c.steps[0].cap)})${c.heads.length > 1 ? ` ×${c.heads.length}` : ""}`;
    main.append(el("div", "cr-path", path));
    const meta = [];
    if (c.steps.length > 1) meta.push(`×${c.factor.toFixed(1)} room size ${spanText(c.months)}`);
    const nx = D.next.get(norm(a.artist));
    if (nx) meta.push(`Next: ${new Date(nx.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${short(nx.venue.name.trim(), 22)}`);
    if (meta.length) main.append(el("div", "cr-meta", meta.join(" · ")));
    sum.append(main, miniLadder(c));
    d.append(sum);
    // Opened: every Toronto show with billing, the SF rooms, and a link to the full card.
    const ul = el("ul", "shows");
    for (const sh of a.shows) {
      const li2 = el("li", isSupport(sh) ? "support" : null,
        `${monthYear(parseDate(sh.date))} · ${sh.venue}${typeof sh.cap === "number" ? ` (${fmt(sh.cap)})` : ""}`);
      if (isSupport(sh)) {
        li2.append(el("span", "tag", sh.billing ? "support" : "likely support"));
        if (sh.with?.length) li2.append(el("span", "with", ` for ${sh.with[0]}`));
      }
      ul.append(li2);
    }
    d.append(el("p", "muted small", `SF: ${a.sf.join(", ")}`), ul);
    if (nx?.url) {
      const t = el("a", "tickets", "Tickets for the next show ↗");
      Object.assign(t, { href: nx.url, target: "_blank", rel: "noopener" });
      d.append(t);
    }
    li.append(d);
    list.append(li);
  }
  if (rows.length > shown.length) {
    const more = el("button", "linkbtn", `Show all ${rows.length}`);
    more.type = "button";
    more.addEventListener("click", () => { state.climbAll = true; renderList(); });
    list.append(more);
  }
}

// The aughts favourites as reference rows: how long from a small room to Warfield size.
function renderPace() {
  const box = document.getElementById("pace");
  box.replaceChildren();
  const bands = D.ladder?.bands || [];
  const head = el("p", "pace-head");
  head.append(el("strong", null, "For pace, your aughts favourites: "));
  if (!bands.length) {
    head.append("pending (the ladder study runs tomorrow).");
    box.append(head);
    return;
  }
  box.append(head);
  const ul = el("ul", "pace-list");
  for (const g of bands) {
    const shows = g.shows.filter((sh) => typeof sh.cap === "number").map((sh) => ({ ...sh, d: parseDate(sh.date) }));
    const start = shows.find((sh) => sh.cap <= SF_PACE_LADDER[0][0]);
    const big = start && shows.find((sh) => sh.d > start.d && sh.cap >= SF_PACE_LADDER[1][0]);
    ul.append(el("li", null, big
      ? `${g.artist}: ${short(start.venue, 20)} (${fmt(start.cap)}) → ${short(big.venue, 20)} (${fmt(big.cap)}) ${spanText((big.d - start.d) / (30.44 * 864e5))}`
      : `${g.artist}: not enough setlist.fm history`));
  }
  box.append(ul);
}

function highlight(name) {
  const svg = document.querySelector(".climbsvg");
  if (!svg) return;
  const k = name && norm(name);
  svg.classList.toggle("has-sel", !!k);
  svg.querySelectorAll(".band").forEach((g) => {
    const on = g.dataset.k === k;
    g.classList.toggle("sel", on);
    if (on) g.parentNode.append(g); // draw on top
  });
}

function select(name, fromChart = false) {
  state.selected = name;
  highlight(name);
  if (name) {
    showCard(name);
    if (fromChart) document.getElementById("lookup").value = name;
  }
}

// ---------- Look up a band ----------

function setupLookup() {
  const list = document.getElementById("bands");
  const names = [...D.shared.values()].map((a) => a.artist).sort((a, b) => a.localeCompare(b));
  for (const n of names) list.append(new Option(n));
  const input = document.getElementById("lookup");
  input.addEventListener("change", () => {
    const a = D.shared.get(norm(input.value));
    if (a) select(a.artist);
  });
}

function showCard(name) {
  const card = document.getElementById("card");
  const k = norm(name);
  const rep = D.repeat.get(k);
  const sh = D.shared.get(k);
  const seen = D.seen.get(k);
  card.replaceChildren();
  card.hidden = false;
  const h = el("h3", null, name);
  if (rep && movingUp(rep)) h.append(" ", el("span", "up", "↑ moving up"));
  if (seen) h.append(" ", el("span", "seenbadge", "★ you've seen them"));
  card.append(h);
  const facts = [];
  if (rep?.listeners != null) facts.push(`${fmt(rep.listeners)} Last.fm listeners`);
  if (sh) facts.push(`SF: ${sh.sf.join(", ")}`);
  if (facts.length) card.append(el("p", "muted", facts.join(" · ")));

  if (rep) {
    const ul = el("ul", "shows");
    for (const s of rep.shows) {
      const li = el("li", isSupport(s) ? "support" : null,
        `${monthYear(parseDate(s.date))} · ${s.venue}${typeof s.cap === "number" ? ` (${fmt(s.cap)})` : ""}`);
      if (isSupport(s)) {
        li.append(el("span", "tag", s.billing ? "support" : "likely support"));
        if (s.with?.length) li.append(el("span", "with", ` for ${s.with[0]}`));
      }
      ul.append(li);
    }
    card.append(el("p", "label", "Toronto shows since Oct 2023"), ul);
    const inChart = climbBands().some((a) => norm(a.artist) === k);
    if (!inChart) {
      const b = el("button", "linkbtn", "Show on The Climb");
      b.type = "button";
      b.addEventListener("click", () => {
        state.mode = "all"; state.sfroom = "";
        document.getElementById("sfroom").value = "";
        document.querySelectorAll("#mode button").forEach((x) => x.setAttribute("aria-checked", x.dataset.v === "all"));
        renderClimb();
        highlight(name);
        document.getElementById("chart").scrollIntoView({ behavior: "smooth", block: "center" });
      });
      card.append(b);
    }
  } else if (sh) {
    card.append(el("p", "label", "Toronto rooms since Oct 2023 (one visit, so not on The Climb)"), el("p", null, sh.toronto.join(", ")));
  }
  if (seen) {
    const ul = el("ul", "shows");
    for (const r of seen) {
      const [d, mo, y] = r.date.split("-").map(Number);
      ul.append(el("li", null, `${monthYear(new Date(y, mo - 1, d))} · ${r.venue}, ${r.city}`));
    }
    card.append(el("p", "label", "You saw them"), ul);
  }
}

// ---------- Your rooms ----------
// Tap a Toronto room for its upcoming shows, ranked by a transparent blend of signals.
// The calendar (every upcoming show with per-act taste scores) comes from the daily
// pipeline; before its first run with that field, only shows that made the picks appear.

const ROOMS_KEY = "nbt.rooms";
const DEFAULT_ROOMS = ["phoenix concert theatre", "mod club", "opera house", "horseshoe tavern",
  "concert hall", "adelaide hall", "drake underground"];
const ROOM_ALIASES = { "axis club": "mod club" }; // setlist.fm logs the Mod Club under both names
// Show score = best act's taste fit plus these bonuses. Kept in one place to tune.
const WEIGHTS = { know: 0.4, heard: 0.15, seen: 0.2, movingUp: 0.25, cameBack: 0.1, sfLink: 0.1 };
const KNOW_DAYS = 3;
const ALL = "__all";
const ROOM_LIMIT = 20; // best N shows first; "show all" for the rest

const roomKey = (name) => {
  const k = name.toLowerCase().trim().replace(/^the /, "").replace(/[^a-z0-9']+/g, " ").trim();
  return ROOM_ALIASES[k] || k;
};

function calendarRows(digest) {
  if (digest.calendar) return { rows: digest.calendar, full: true };
  // Fallback: rebuild what we can from the picks.
  const byEvent = new Map();
  for (const tier of Object.values(digest.picks || {})) for (const p of tier) {
    const e = p.event;
    if (!byEvent.has(e.id)) byEvent.set(e.id, { id: e.id, starts_at: e.starts_at, url: e.url, venue: e.venue, acts: e.lineup.map((a) => ({ artist: a })) });
    const act = byEvent.get(e.id).acts.find((x) => x.artist === p.artist);
    if (act) Object.assign(act, { affinity: p.tier === "know" ? 0 : p.score, listeners: p.listeners, why: p.reasons[0] });
    if (act && p.tier === "know") act.days = Number(p.reasons[0].match(/on (\d+) days/)?.[1] || KNOW_DAYS);
  }
  return { rows: [...byEvent.values()], full: false };
}

function scoreShow(row) {
  let taste = 0, bonus = 0;
  const chips = [];
  let best = null;
  for (const act of row.acts) {
    if (act.skipped) continue;
    if ((act.affinity || 0) > taste) { taste = act.affinity; best = act; }
  }
  if (best?.why) {
    const names = best.why.replace(/^similar to /, "").replace(/ \(\d\.\d+\)/g, "").split(", ");
    chips.push(best.why.startsWith("similar to") ? `Like ${names.slice(0, 2).join(", ")}` : best.why.replace(/^tags match your taste: /, "Tags: "));
  }
  const add = (w, text) => { bonus += w; chips.push(text); };
  // Chips about the headliner skip the name; chips about an opener lead with it.
  const head = row.acts[0]?.artist;
  const who = (a, text) => (a === head ? text : `${a}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
  const known = row.acts.find((a) => (a.days || 0) >= KNOW_DAYS);
  const heard = row.acts.find((a) => a.days && a.days < KNOW_DAYS);
  if (known) add(WEIGHTS.know, who(known.artist, `You know them · ${known.days} days`));
  else if (heard) add(WEIGHTS.heard, who(heard.artist, "Heard before"));
  const seen = row.acts.find((a) => D.seen.has(norm(a.artist)));
  if (seen) add(WEIGHTS.seen, who(seen.artist, "You've seen them"));
  const rep = row.acts.map((a) => D.repeat.get(norm(a.artist))).find(Boolean);
  if (rep && movingUp(rep)) add(WEIGHTS.movingUp, who(rep.artist, "Moving up"));
  else if (rep) add(WEIGHTS.cameBack, who(rep.artist, "Keeps coming back"));
  const sf = row.acts.map((a) => D.shared.get(norm(a.artist))).find(Boolean);
  if (sf) add(WEIGHTS.sfLink, who(sf.artist, `Played ${sf.sf[0]}${sf.sf.length > 1 ? ` +${sf.sf.length - 1}` : ""}`));
  return { score: taste + bonus, taste, bonus, chips };
}

function setupRooms(digest) {
  const { rows, full } = calendarRows(digest);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.starts_at.slice(0, 10) >= today);
  const byRoom = new Map();
  for (const r of upcoming) {
    const k = roomKey(r.venue.name);
    if (!byRoom.has(k)) byRoom.set(k, { name: r.venue.name.trim(), cap: r.venue.capacity, rows: [] });
    byRoom.get(k).rows.push(r);
  }
  D.rooms = { byRoom, full };
  state.rooms = store.get(ROOMS_KEY, DEFAULT_ROOMS);
  state.room = ALL;
  renderRoomChips();
  renderRoom();
}

function renderRoomChips() {
  const box = document.getElementById("roomchips");
  box.replaceChildren();
  const chip = (key, label, count) => {
    const b = el("button", "roomchip", label);
    b.type = "button";
    b.setAttribute("aria-pressed", state.room === key);
    if (count != null) b.append(el("span", "n", ` ${count}`));
    b.addEventListener("click", () => { state.room = key; state.roomAll = false; renderRoomChips(); renderRoom(); });
    box.append(b);
  };
  const followed = state.rooms.map((k) => [k, D.rooms.byRoom.get(k)]);
  chip(ALL, "All your rooms", followed.reduce((n, [, r]) => n + (r?.rows.length || 0), 0));
  for (const [k, r] of followed) chip(k, r ? short(r.name, 22) : k.replace(/\b\w/g, (c) => c.toUpperCase()), r?.rows.length || 0);
  // Any other room with upcoming shows
  const sel = el("select", "roomadd");
  sel.append(new Option("Another room…", ""));
  [...D.rooms.byRoom.entries()].filter(([k]) => !state.rooms.includes(k))
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([k, r]) => sel.append(new Option(`${r.name} (${r.rows.length})`, k)));
  sel.addEventListener("change", () => { if (sel.value) { state.room = sel.value; state.roomAll = false; renderRoomChips(); renderRoom(); } });
  if (!state.rooms.includes(state.room) && state.room !== ALL) sel.value = state.room;
  box.append(sel);
}

function roomProfile(key) {
  // Twin SF rooms: how much more this room leans toward each SF room than a typical one.
  const v = D.research.toronto_venues.find((x) => roomKey(x.name) === key);
  const bits = [];
  if (v) {
    const reach = {};
    for (const a of D.research.shared_artists) for (const s of a.sf) reach[s] = (reach[s] || 0) + 1;
    const twins = Object.entries(v.by_sf_venue)
      .filter(([, n]) => n >= 3)
      .map(([s, n]) => ({ s, n, lift: n / v.artists / ((reach[s] || 1) / D.research.toronto.artists) }))
      .sort((a, b) => b.lift - a.lift).slice(0, 2);
    if (twins.length) bits.push(`Closest SF rooms: ${twins.map((t) => `${t.s} (${t.n} shared, ${t.lift.toFixed(1)}×)`).join(", ")}`);
  }
  // Launchpad: climbers whose first Toronto headline show was here.
  const launched = D.research.repeat_artists.filter((a) => {
    if (!movingUp(a)) return false;
    const first = a.shows.find((sh) => !isSupport(sh));
    return first && roomKey(first.venue) === key;
  });
  return { bits, launched };
}

function renderRoom() {
  const box = document.getElementById("room");
  box.replaceChildren();
  const all = state.room === ALL;
  const keys = all ? state.rooms : [state.room];
  const rows = keys.flatMap((k) => (D.rooms.byRoom.get(k)?.rows || []).map((r) => ({ r, k })));
  const r0 = !all && D.rooms.byRoom.get(state.room);

  if (!all) {
    const head = el("div", "roomhead");
    const name = r0?.name || state.room;
    head.append(el("h3", null, name));
    const followed = state.rooms.includes(state.room);
    const star = el("button", "follow", followed ? "★ Following" : "☆ Follow");
    star.type = "button";
    star.addEventListener("click", () => {
      state.rooms = followed ? state.rooms.filter((k) => k !== state.room) : [...state.rooms, state.room];
      store.set(ROOMS_KEY, state.rooms);
      renderRoomChips(); renderRoom();
    });
    head.append(star);
    box.append(head);
    const cap = r0?.cap || CAPS[name.toLowerCase()];
    const { bits, launched } = roomProfile(state.room);
    if (typeof cap === "number") bits.unshift(`~${fmt(cap)} capacity`);
    if (bits.length) box.append(el("p", "muted", bits.join(" · ")));
    if (launched.length) {
      const p = el("p", "launch");
      p.append(el("strong", null, `First Toronto headline room for ${launched.length} climber${launched.length > 1 ? "s" : ""}: `));
      launched.slice(0, 8).forEach((a, i) => {
        const b = el("button", "linkbtn", a.artist);
        b.type = "button";
        b.addEventListener("click", () => { select(a.artist); document.getElementById("card").scrollIntoView({ behavior: "smooth", block: "start" }); });
        p.append(b, i < Math.min(launched.length, 8) - 1 ? " · " : "");
      });
      if (launched.length > 8) p.append(` and ${launched.length - 8} more`);
      box.append(p);
    }
  }

  if (!D.rooms.full) box.append(el("p", "muted small", "Showing only shows that made your picks. Every show at each room appears after the next daily update."));
  if (!rows.length) { box.append(el("p", "empty", "No upcoming shows found here.")); return; }

  const scored = rows.map(({ r, k }) => ({ r, k, ...scoreShow(r) }))
    .sort((a, b) => b.score - a.score || a.r.starts_at.localeCompare(b.r.starts_at));
  const list = el("ol", "roomlist");
  const shown = state.roomAll ? scored : scored.slice(0, ROOM_LIMIT);
  for (const s of shown) {
    // Same shape as the main page's cards: a date tile, then headliner, support, why.
    const li = el("li", "rl");
    const d = new Date(s.r.starts_at);
    const tile = el("div", "when");
    tile.append(el("span", "dow", d.toLocaleDateString(undefined, { weekday: "short" })),
      el("span", "day", String(d.getDate())), el("span", "mon", d.toLocaleDateString(undefined, { month: "short" })));
    const body = el("div", "rl-body");
    const head = el("div", "rl-head");
    const [first, ...rest] = s.r.acts.map((a) => a.artist);
    head.append(el("span", "rl-bill", first));
    const sc = el("span", "score", s.score.toFixed(2));
    sc.title = `taste ${s.taste.toFixed(2)} + bonuses ${s.bonus.toFixed(2)}`;
    head.append(sc);
    body.append(head);
    const meta = [];
    if (rest.length) meta.push(`with ${rest.join(", ")}`);
    if (all) meta.push(D.rooms.byRoom.get(s.k)?.name || s.k);
    if (meta.length) body.append(el("p", "rl-meta", meta.join(" · ")));
    const foot = el("div", "rl-foot");
    for (const c of s.chips.slice(0, 3)) foot.append(el("span", "rl-chip", c));
    if (s.r.url) {
      const a = el("a", "tickets", "Tickets ↗");
      Object.assign(a, { href: s.r.url, target: "_blank", rel: "noopener" });
      foot.append(a);
    }
    if (foot.childNodes.length) body.append(foot);
    li.append(tile, body);
    list.append(li);
  }
  box.append(list);
  if (scored.length > shown.length) {
    const more = el("button", "linkbtn", `Show all ${scored.length} shows`);
    more.type = "button";
    more.addEventListener("click", () => { state.roomAll = true; renderRoom(); });
    box.append(more);
  }
}

// ---------- Room rivers ----------
// The band panel under the rivers: the bands in a room or stream, as small cards, with
// filters like the main page's tabs. Tiers come from the research job, which scores the
// shared bands with the same taste model and cutoffs as the picks; until a research run
// has done that, only the flag filters show.

const TIERS = [["next_big_thing", "Next big thing"], ["would_like", "You'd probably like"], ["know", "Bands you know"]];
const TIER_RANK = { next_big_thing: 0, would_like: 1, know: 2, other: 3, skip: 4 };
const FLAGS = [
  ["soon", "Playing soon", (a) => D.next.has(norm(a.artist))],
  ["up", "Moving up", (a) => { const r = D.repeat.get(norm(a.artist)); return !!r && movingUp(r); }],
  ["back", "Came back", (a) => D.repeat.has(norm(a.artist))],
  ["seen", "You've seen", (a) => D.seen.has(norm(a.artist))],
];
const RIVER_CARDS = 30;

function riverPanel(bands, title) {
  const box = document.getElementById("riverpanel");
  box.replaceChildren();
  if (!bands) return;
  const hasTiers = bands.some((a) => a.tier);
  const filters = [["all", "All", () => true],
    ...(hasTiers ? TIERS.map(([t, label]) => [t, label, (a) => a.tier === t]) : []),
    ...FLAGS];
  const chips = el("div", "seg rp-filters");
  for (const [key, label, test] of filters) {
    const n = bands.filter(test).length;
    if (!n && key !== "all") continue;
    const b = el("button", null, `${label} ${n}`);
    b.type = "button";
    b.setAttribute("aria-checked", state.riverFilter === key);
    b.addEventListener("click", () => { state.riverFilter = key; state.riverAll = false; riverPanel(bands, title); });
    chips.append(b);
  }
  box.append(chips);
  const test = filters.find(([k]) => k === state.riverFilter)?.[2] || (() => true);
  const list = bands.filter(test).sort((a, b) =>
    (TIER_RANK[a.tier] ?? 3) - (TIER_RANK[b.tier] ?? 3) ||
    (D.next.has(norm(b.artist)) - D.next.has(norm(a.artist))) ||
    (a.listeners ?? 1e9) - (b.listeners ?? 1e9) || a.artist.localeCompare(b.artist));
  const shown = state.riverAll ? list : list.slice(0, RIVER_CARDS);
  const grid = el("div", "rp-grid");
  for (const a of shown) grid.append(riverCard(a));
  box.append(grid);
  if (list.length > shown.length) {
    const more = el("button", "linkbtn", `Show all ${list.length}`);
    more.type = "button";
    more.addEventListener("click", () => { state.riverAll = true; riverPanel(bands, title); });
    box.append(more);
  }
}

function riverCard(a) {
  const k = norm(a.artist);
  const card = el("button", "rp-card");
  card.type = "button";
  const top = el("div", "rp-top");
  top.append(el("span", "rp-name", a.artist));
  const tierLabel = TIERS.find(([t]) => t === a.tier)?.[1];
  if (tierLabel) top.append(el("span", `rp-tier t-${a.tier}`, tierLabel));
  card.append(top);
  const facts = [];
  const listeners = a.listeners ?? D.repeat.get(k)?.listeners;
  if (listeners != null) facts.push(fmtListeners(listeners));
  if (a.days) facts.push(`${a.days} days played`);
  if (facts.length) card.append(el("div", "rp-facts", facts.join(" · ")));
  // Only tiered bands get a reason: below the cutoffs it's weak evidence and just noise.
  if (a.why && tierLabel) card.append(el("div", "rp-why", a.why.replace(/ \(\d\.\d+\)/g, "")));
  const flags = el("div", "rp-flags");
  const nx = D.next.get(k);
  if (nx) flags.append(el("span", "rl-chip hot", `${new Date(nx.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${short(nx.venue.name.trim(), 18)}`));
  const rep = D.repeat.get(k);
  if (rep && movingUp(rep)) flags.append(el("span", "rl-chip", "Moving up"));
  else if (rep) flags.append(el("span", "rl-chip", "Came back"));
  if (D.seen.has(k)) flags.append(el("span", "rl-chip", "★ Seen"));
  if (flags.childNodes.length) card.append(flags);
  card.addEventListener("click", () => { select(a.artist); document.getElementById("card").scrollIntoView({ behavior: "smooth", block: "start" }); });
  return card;
}

function renderRivers() {
  const box = document.getElementById("rivers");
  box.replaceChildren();
  const info = document.getElementById("riverinfo");
  const W = box.clientWidth;
  const narrow = W < 600;
  const sideW = narrow ? 104 : 190;
  const rowH = narrow ? 30 : 32;

  const left = [...D.research.sf_venues].sort((a, b) => firstNumber(a.capacity) - firstNumber(b.capacity));
  const right = D.research.toronto_venues
    .filter((v) => typeof CAPS[v.name.toLowerCase()] === "number" && CAPS[v.name.toLowerCase()] <= LADDER_MAX)
    .sort((a, b) => b.overlap - a.overlap).slice(0, RIVER_ROOMS)
    .sort((a, b) => CAPS[a.name.toLowerCase()] - CAPS[b.name.toLowerCase()]);
  const links = [];
  for (const s of left) for (const t of right) {
    const n = t.by_sf_venue[s.name] || 0;
    if (n >= RIVER_MIN) links.push({ s: s.name, t: t.name, n });
  }
  const H = Math.max(left.length, right.length) * rowH + 10;
  const yL = d3.scalePoint().domain(left.map((v) => v.name)).range([16, H - 16]);
  const yR = d3.scalePoint().domain(right.map((v) => v.name)).range([16, H - 16]);
  const wScale = d3.scaleSqrt().domain([RIVER_MIN, d3.max(links, (l) => l.n) || RIVER_MIN]).range([1, narrow ? 10 : 16]);
  const x1 = sideW + 6, x2 = W - sideW - 6, mx = (x1 + x2) / 2;

  const svg = d3.select(box).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "riversvg");
  const gl = svg.append("g").attr("class", "streams");
  const paths = gl.selectAll("path").data(links).join("path")
    .attr("d", (l) => `M${x1},${yL(l.s)} C${mx},${yL(l.s)} ${mx},${yR(l.t)} ${x2},${yR(l.t)}`)
    .attr("stroke-width", (l) => wScale(l.n));
  paths.append("title").text((l) => `${l.s} → ${l.t}: ${l.n} shared bands`);

  const caps = Object.fromEntries(left.map((v) => [v.name, v.capacity]));
  const nodes = svg.append("g").attr("class", "nodes");
  nodes.selectAll("text.l").data(left).join("text").attr("class", "l")
    .attr("x", sideW).attr("y", (v) => yL(v.name) + 4).attr("text-anchor", "end")
    .text((v) => short(v.name, narrow ? 16 : 30));
  nodes.selectAll("text.r").data(right).join("text").attr("class", "r")
    .attr("x", W - sideW).attr("y", (v) => yR(v.name) + 4)
    .text((v) => `${short(v.name, narrow ? 15 : 28)}${narrow ? "" : ` · ${fmt(CAPS[v.name.toLowerCase()])}`}`);

  const HINT = "Tap a room or a stream to see its bands.";
  const focus = (pred, text, bands) => {
    svg.classed("has-sel", !!pred);
    paths.classed("on", (l) => !!pred && pred(l));
    info.replaceChildren(el("p", null, text || HINT));
    state.riverFilter = "all";
    riverPanel(bands || null, text);
  };
  const bandsWhere = (pred) => [...D.shared.values()].filter(pred);
  nodes.selectAll("text.l").on("click", (e, v) => {
    e.stopPropagation();
    const mine = links.filter((l) => l.s === v.name).sort((a, b) => b.n - a.n);
    focus((l) => l.s === v.name,
      `${v.name} (${caps[v.name]}) → ${mine.slice(0, 4).map((l) => `${short(l.t, 20)} ${l.n}`).join(" · ") || "no streams"}`,
      bandsWhere((a) => a.sf.includes(v.name)));
  });
  nodes.selectAll("text.r").on("click", (e, v) => {
    e.stopPropagation();
    const mine = links.filter((l) => l.t === v.name).sort((a, b) => b.n - a.n);
    focus((l) => l.t === v.name,
      `${v.name} (${fmt(CAPS[v.name.toLowerCase()])}) ← ${mine.slice(0, 4).map((l) => `${short(l.s, 20)} ${l.n}`).join(" · ") || "no streams"}`,
      bandsWhere((a) => a.toronto.includes(v.name)));
  });
  paths.on("click", (e, l) => {
    e.stopPropagation();
    focus((x) => x === l, `${l.s} → ${l.t}: ${l.n} bands`, bandsWhere((a) => a.sf.includes(l.s) && a.toronto.includes(l.t)));
  });
  svg.on("click", () => focus(null));
  focus(null);
}

load();
