// Backstage: the data behind the picks.
//   - The Climb: each band's Toronto shows over time, by room size (log scale), with the
//     user's aughts favourites as dashed "ghost" lines for pace when time is aligned.
//   - Look up a band: its journey, billing, and whether the user has seen it.
//   - Rivers: SF rooms → Toronto rooms, stream width = shared bands.
//   - Ledger: next-big-thing picks, listeners when flagged and now.
//   - Attended: every setlist.fm-logged show, with listeners now.
// Data: data/venue_research.json, data/toronto_capacity.json, data/ladder_study.json
// (optional) and data/digest.json (ledgers, attended shows, calendar). Billing rules live
// in ladder.js; the calendar helpers in rooms.js.

const CAP_DOMAIN = [100, 20000];
const ALIGN_MAX_YEARS = 10; // aughts climbs run longer; the interesting part is the start
const RUNGS = [[250, "Monarch 250"], [700, "Lee's 700"], [1427, "Danforth 1,427"], [2765, "Massey 2,765"]];
const RIVER_MIN = 3; // streams with fewer shared bands are left out
const RIVER_ROOMS = 12;

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
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
  renderLedger(digest);
  renderAttended(digest);
  setupTabs();
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
  // Today's picks by artist, best tier first, for live scores on band cards.
  const picks = new Map();
  for (const tier of ["next_big_thing", "would_like", "know"]) {
    for (const p of digest.picks?.[tier] || []) if (!picks.has(norm(p.artist))) picks.set(norm(p.artist), p);
  }
  D = { research, ladder, seen, repeat, shared, picks };
  state.align = "aligned"; // every band starts at 0, so lines fan out instead of crossing
  D.next = nextShows(digest);
  setupControls();
  renderPace();
  renderClimb();
  document.getElementById("chartwrap").addEventListener("toggle", (e) => { if (e.target.open) renderChart(); });
  setupLookup();
  setupSheet();
  showTab(state.tab); // draw whatever needed the data
  let w = document.getElementById("chart").clientWidth;
  window.addEventListener("resize", () => {
    const nw = document.getElementById("chart").clientWidth;
    if (nw !== w) { w = nw; renderClimb(); if (state.tab === "rivers") renderRivers(); }
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
  // Steps: hold the room size, then jump. Along time first, whichever way time runs.
  const stair = d3.line().x((d) => d[0]).y((d) => d[1]).curve(vertical ? d3.curveStepBefore : d3.curveStepAfter);
  const gg = svg.append("g").attr("class", "ghosts");
  const usedY = [];
  for (const g of ghosts) {
    // Same staircase as the bands: biggest room so far, so festival or support
    // dips don't zig-zag across the chart.
    let best = 0;
    const pts = g.pts.filter((p) => years(p.date, g.t0) <= ALIGN_MAX_YEARS)
      .map((p) => { best = Math.max(best, p.cap); return xy(years(p.date, g.t0), best); });
    gg.append("path").attr("d", stair(pts));
    const last = pts[pts.length - 1];
    // Bands that top out at the same room would print their names on top of each other.
    let ly = last[1] + (vertical ? -6 : -4);
    while (usedY.some((u) => Math.abs(u - ly) < 11)) ly += vertical ? -11 : 11;
    usedY.push(ly);
    gg.append("text").attr("x", last[0] + (vertical ? -4 : 4)).attr("y", ly)
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
// Long setlist.fm venue names, as people say them.
const VENUE_NICK = {
  "William Randolph Hearst Greek Theatre": "Greek Theatre",
  "Great American Music Hall": "Great American",
  "Louise M. Davies Symphony Hall": "Davies Hall",
};
const nick = (v) => VENUE_NICK[v] || v;
const SF_PACE_LADDER = [[700, "small room"], [2300, "Warfield size"]];
const CLIMB_LIMIT = 25;

function renderClimb() {
  renderList();
  if (document.getElementById("chartwrap").open && state.tab === "climb") renderChart();
}

// ---------- Tabs and the band sheet ----------
// Tabs like the picks page: The Climb (the default), Rivers, Ledger and Attended.
// The tab is mirrored in the URL hash, so a link or bookmark can open any of them. Rivers are drawn when their tab first shows,
// since a hidden tab has no width to lay out in.

const TABS_X = ["climb", "rivers", "ledger", "attended"];
const OLD_HASH = { rooms: "rivers" }; // Rooms moved to the picks page; its rivers stayed here

function setupTabs() {
  const fromHash = () => OLD_HASH[location.hash.slice(1)] || location.hash.slice(1);
  const initial = TABS_X.includes(fromHash()) ? fromHash() : "climb";
  document.getElementById("xtabs").addEventListener("click", (e) => {
    const t = e.target.closest("button")?.dataset.tab;
    if (t) showTab(t);
  });
  window.addEventListener("hashchange", () => { const t = fromHash(); if (TABS_X.includes(t)) showTab(t); });
  showTab(initial);
}

function showTab(t) {
  state.tab = t;
  if (location.hash.slice(1) !== t) history.replaceState(null, "", `#${t}`);
  document.querySelectorAll("#xtabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  for (const id of TABS_X) document.getElementById(`tab-${id}`).hidden = id !== t;
  if (!D) return; // research still loading, or missing; load() calls back
  if (t === "rivers") {
    const w = document.getElementById("rivers").clientWidth;
    if (w !== state.riversWidth) { state.riversWidth = w; renderRivers(); }
  } else if (t === "climb" && document.getElementById("chartwrap").open) renderChart();
}

// ---------- Ledger and Attended ----------
// Plain tables from the digest. They need no research data, so they render first.

// head: [label, kind] with kind "num" (right-aligned) or "date" (kept on one line).
function table(head, rows) {
  const wrap = el("div", "ledger-wrap");
  const t = el("table");
  const tr = el("tr");
  for (const [label, kind] of head) tr.append(el("th", kind || null, label));
  t.append(el("thead"));
  t.tHead.append(tr);
  const body = el("tbody");
  for (const r of rows) {
    const row = el("tr");
    r.forEach((v, i) => row.append(el("td", head[i][1] || null, v)));
    body.append(row);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}

const fmtMaybe = (n) => (n == null ? "—" : new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n));
// "Oct 19" this year, "Jul 2019" before: the day matters less as a show gets older, and it
// keeps the column narrow on a phone. Built from local parts (see localDay).
const shortDate = (y, m, d) => new Date(y, m - 1, d).toLocaleDateString(undefined,
  y === new Date().getFullYear() ? { month: "short", day: "numeric" } : { month: "short", year: "numeric" });

function renderLedger(digest) {
  const box = document.getElementById("ledger");
  const rows = digest.ledger || [];
  if (!rows.length) return box.append(el("p", "empty", "The ledger fills up as next-big-thing picks are flagged. Check back in a few months to see who blew up."));
  box.append(table([["Artist"], ["Flagged", "date"], ["Then", "num"], ["Now", "num"], ["Growth", "num"]], rows.map((r) => [
    r.artist, shortDate(...r.first_flagged.split("-").map(Number)), fmtMaybe(r.listeners_at_flag), fmtMaybe(r.listeners_now),
    r.listeners_at_flag && r.listeners_now ? `${(r.listeners_now / r.listeners_at_flag).toFixed(1)}×` : "—",
  ])));
}

function renderAttended(digest) {
  const box = document.getElementById("attended");
  const rows = digest.attended_ledger || [];
  if (!rows.length) return box.append(el("p", "empty", "No attended shows found. Check that SETLISTFM_API_KEY is set and the setlist.fm user has logged shows."));
  // setlist.fm uses DD-MM-YYYY.
  const slfDate = (s) => { const [d, m, y] = s.split("-").map(Number); return shortDate(y, m, d); };
  box.append(table([["Artist"], ["Seen", "date"], ["Venue"], ["Now", "num"]], rows.map((r) => [
    r.artist, slfDate(r.date), r.city === "Toronto" ? r.venue : `${r.venue}, ${r.city}`, fmtMaybe(r.listeners_now),
  ])));
}

function setupSheet() {
  const sheet = document.getElementById("sheet");
  sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
}

function openSheet() {
  const sheet = document.getElementById("sheet");
  sheet.hidden = false;
  document.body.classList.add("sheet-open");
  sheet.querySelector(".sheet-body").scrollTop = 0;
  sheet.querySelector(".sheet-close").focus({ preventScroll: true });
}

function closeSheet() {
  document.getElementById("sheet").hidden = true;
  document.body.classList.remove("sheet-open");
  document.getElementById("lookup").value = "";
  state.selected = null;
  highlight(null);
}

// Upcoming Toronto dates per artist, from the digest's calendar (or picks).
function nextShows(digest) {
  const { rows } = calendarRows(digest);
  const today = localDay();
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
      ? `${g.artist}: ${short(nick(start.venue), 20)} (${fmt(start.cap)}) → ${short(nick(big.venue), 20)} (${fmt(big.cap)}) ${spanText((big.d - start.d) / (30.44 * 864e5))}`
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
    if (a && a.artist !== state.selected) select(a.artist);
  });
}

// The band card, in the picks page's card style minus the date tile: name with the
// strength badge (pips, label, raw score), chips, the "why" with similarity weights,
// then Toronto shows and listen/ticket links. The score is the live pick when the band
// is in today's picks; otherwise it's rebuilt from the research tier with the
// pipeline's formula, minus the event bonuses (venue, shared bill, growth).
function showCard(name) {
  const card = document.getElementById("card");
  const k = norm(name);
  const rep = D.repeat.get(k);
  const sh = D.shared.get(k);
  const seen = D.seen.get(k);
  const sc = scoreFor(k, sh);
  card.replaceChildren();

  const head = el("div", "head");
  head.append(el("h2", "artist", name));
  if (sc) {
    const lvl = strengthOf(sc.tier, sc.score);
    card.classList.toggle("strong", lvl.pips === 3);
    const st = el("span", "strength");
    const pips = el("span", "pips");
    for (let n = 0; n < 3; n++) pips.append(el("i", n < lvl.pips ? "on" : null));
    st.append(pips, el("span", "label", lvl.label), el("span", "score", sc.score.toFixed(2)));
    st.title = sc.live ? `Today's pick score ${sc.score.toFixed(3)}` : `Estimated ${sc.score.toFixed(3)}, without venue, bill and growth bonuses`;
    head.append(st);
  } else card.classList.remove("strong");
  card.append(head);
  if (sh) card.append(el("p", "where", `SF: ${sh.sf.join(", ")}`));

  const chips = el("ul", "chips");
  const chip = (text, hot) => chips.append(el("li", hot ? "hot" : null, text));
  const tierLabel = TIERS.find(([t]) => t === sc?.tier)?.[1];
  if (tierLabel) chip(tierLabel, true); // every tier chip is pink, as on the picks page
  const listeners = rep?.listeners ?? sh?.listeners;
  if (listeners != null) chip(fmtListeners(listeners));
  if (sh?.days) chip(sh.days >= 3 ? `Played ${sh.days} days` : `Heard ${sh.days} day${sh.days > 1 ? "s" : ""}`);
  if (rep && movingUp(rep)) chip("Moving up", true);
  else if (rep) chip("Came back");
  if (seen) chip("★ You've seen them");
  const nx = D.next.get(k);
  if (nx) chip(`${new Date(nx.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${short(nx.venue.name.trim(), 22)}`, true);
  if (chips.childNodes.length) card.append(chips);

  const why = whyList(sc?.why || []);
  if (why.childNodes.length) card.append(why);

  // Toronto shows: the comeback list has billing; other bands have dates and rooms.
  const shows = rep?.shows || sh?.shows || (sh?.toronto || []).map((venue) => ({ venue }));
  if (shows.length) {
    const ul = el("ul", "shows");
    for (const s of shows) {
      const when = s.date ? `${monthYear(parseDate(s.date))} · ` : "";
      const li = el("li", rep && isSupport(s) ? "support" : null, `${when}${s.venue}${typeof s.cap === "number" ? ` (${fmt(s.cap)})` : ""}`);
      if (rep && isSupport(s)) {
        li.append(el("span", "tag", s.billing ? "support" : "likely support"));
        if (s.with?.length) li.append(el("span", "with", ` for ${s.with[0]}`));
      }
      ul.append(li);
    }
    card.append(el("p", "label", "Toronto shows since Oct 2023"), ul);
  }
  if (seen) {
    const ul = el("ul", "shows");
    for (const r of seen) {
      const [d, mo, y] = r.date.split("-").map(Number);
      ul.append(el("li", null, `${monthYear(new Date(y, mo - 1, d))} · ${r.venue}, ${r.city}`));
    }
    card.append(el("p", "label", "You saw them"), ul);
  }
  card.append(cardActions(name));
  openSheet(); // last: it moves focus, which can fire the search box's change event
}

// Strength, as on the picks page. Thresholds and levels mirror STRENGTH in app.js.
const STRENGTH = {
  next_big_thing: { strong: 0.35, good: 0.25 },
  would_like: { strong: 0.55, good: 0.45 },
  know: { strong: 2.5, good: 1.8 },
};
const LEVELS = [{ pips: 3, label: "Strong" }, { pips: 2, label: "Good" }, { pips: 1, label: "Worth a look" }];
const strengthOf = (tier, score) => {
  const t = STRENGTH[tier];
  return !t ? LEVELS[2] : score >= t.strong ? LEVELS[0] : score >= t.good ? LEVELS[1] : LEVELS[2];
};
const NBT_CEILING = 100000; // CONFIG.nbt_max_listeners
const smallness = (n) => (n <= 100 ? 1 : Math.max(0, 1 - Math.log(n / 100) / Math.log(NBT_CEILING / 100)));

function scoreFor(k, sh) {
  const pick = D.picks.get(k);
  if (pick) return { tier: pick.tier, score: pick.score, why: pick.reasons, live: true };
  if (!sh?.tier || !STRENGTH[sh.tier]) return null;
  const why = sh.why ? [sh.why] : [];
  if (sh.tier === "know") return { tier: "know", score: Math.log1p(sh.days || 0), why, live: false };
  const aff = sh.affinity || 0;
  const score = sh.tier === "next_big_thing" ? aff * (0.6 + 0.4 * smallness(sh.listeners ?? 0)) : aff;
  return { tier: sh.tier, score, why, live: false };
}

// "Similar to A 0.62, B 0.50" and "Tags: a · b", styled like the picks page's why line.
function whyList(reasons) {
  const ul = el("ul", "why");
  for (const r of reasons) {
    let m;
    const li = el("li");
    if ((m = r.match(/^similar to (.+)$/))) {
      li.append(el("span", "k", "Similar to "));
      [...m[1].matchAll(/(.+?) \((\d\.\d+)\)(?:, |$)/g)].forEach((x, i) => {
        if (i) li.append(", ");
        li.append(x[1], el("span", "w", x[2]));
      });
    } else if ((m = r.match(/^tags match your taste: (.+)$/))) {
      li.append(el("span", "k", "Tags: "), m[1].split(", ").join(" · "));
    } else if (r.startsWith("sharing the bill")) {
      li.textContent = r.charAt(0).toUpperCase() + r.slice(1);
    } else continue;
    ul.append(li);
  }
  return ul;
}

// Same listen links as the main page's cards (icons copied from app.js), plus tickets
// for the band's next Toronto show when one is on the calendar.
const LISTEN = [
  ["https://soundcloud.com/search?q=", "SoundCloud", '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5v7.8a2.5 2.5 0 1 0 1.5 2.3V5.2l5-1.1v4.7a2.5 2.5 0 1 0 1.5 2.3V1.6z"/></svg>'],
  ["https://www.youtube.com/results?search_query=", "YouTube", '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M15.2 4.3a2 2 0 0 0-1.4-1.4C12.6 2.6 8 2.6 8 2.6s-4.6 0-5.8.3A2 2 0 0 0 .8 4.3 21 21 0 0 0 .5 8a21 21 0 0 0 .3 3.7 2 2 0 0 0 1.4 1.4c1.2.3 5.8.3 5.8.3s4.6 0 5.8-.3a2 2 0 0 0 1.4-1.4A21 21 0 0 0 15.5 8a21 21 0 0 0-.3-3.7zM6.5 10.3V5.7L10.4 8z"/></svg>'],
];

function listenLinks(name) {
  const listen = el("span", "listen");
  for (const [base, label, icon] of LISTEN) {
    const a = el("a");
    Object.assign(a, { href: base + encodeURIComponent(name), target: "_blank", rel: "noopener", title: `${name} on ${label}` });
    a.innerHTML = icon;
    a.append(el("span", "txt", label));
    listen.append(a);
  }
  return listen;
}

function cardActions(name) {
  const foot = el("div", "foot");
  foot.append(listenLinks(name));
  const nx = D.next.get(norm(name));
  if (nx?.url) {
    // The date and room are already in the chips above; the link just says Tickets.
    const t = el("a", "tickets", "Tickets ↗");
    Object.assign(t, { href: nx.url, target: "_blank", rel: "noopener" });
    foot.append(t);
  }
  return foot;
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
  card.addEventListener("click", () => select(a.artist));
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
