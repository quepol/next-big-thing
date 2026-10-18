// The Climb: an exploratory view of the venue research.
//   - The Climb: each band's Toronto shows over time, by room size (log scale), with the
//     user's aughts favourites as dashed "ghost" lines for pace when time is aligned.
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
  setupControls();
  renderClimb();
  setupLookup();
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
  align.addEventListener("change", () => { state.align = align.value; renderClimb(); });
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

function renderClimb() {
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

  const note = document.getElementById("climbnote");
  note.textContent = `${fmt(bands.length)} band${bands.length === 1 ? "" : "s"}. ` +
    "Lines step up when a band headlines a bigger room than before; dots are every show. " +
    (aligned ? "Each band starts at its first headline show in Toronto since Oct 2023. " : "") +
    (aligned && ghosts.length ? "Dashed lines are your aughts favourites, from their first Bay Area or Toronto show. " : "") +
    (aligned && !ghosts.length ? "Your aughts favourites appear as dashed lines once the ladder study finishes. " : "") +
    "Tap a line for details.";
  if (state.selected) highlight(state.selected);
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

// ---------- Room rivers ----------

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

  const focus = (pred, text) => {
    svg.classed("has-sel", !!pred);
    paths.classed("on", (l) => !!pred && pred(l));
    info.replaceChildren();
    if (text) info.append(text);
  };
  nodes.selectAll("text.l").on("click", (e, v) => {
    e.stopPropagation();
    const mine = links.filter((l) => l.s === v.name).sort((a, b) => b.n - a.n);
    focus((l) => l.s === v.name, `${v.name} (${caps[v.name]}) → ${mine.map((l) => `${l.t} ${l.n}`).join(" · ") || "no streams"}`);
  });
  nodes.selectAll("text.r").on("click", (e, v) => {
    e.stopPropagation();
    const mine = links.filter((l) => l.t === v.name).sort((a, b) => b.n - a.n);
    focus((l) => l.t === v.name, `${v.name} (${fmt(CAPS[v.name.toLowerCase()])}) ← ${mine.map((l) => `${l.s} ${l.n}`).join(" · ") || "no streams"}`);
  });
  paths.on("click", (e, l) => {
    e.stopPropagation();
    const names = [...D.shared.values()].filter((a) => a.sf.includes(l.s) && a.toronto.includes(l.t)).map((a) => a.artist)
      .sort((a, b) => a.localeCompare(b));
    const p = el("p");
    p.append(el("strong", null, `${l.s} → ${l.t}: ${l.n} bands. `));
    names.forEach((n, i) => {
      const b = el("button", "linkbtn", n);
      b.type = "button";
      b.addEventListener("click", () => { select(n); document.getElementById("card").scrollIntoView({ behavior: "smooth", block: "start" }); });
      p.append(b, i < names.length - 1 ? " · " : "");
    });
    focus((x) => x === l, p);
  });
  svg.on("click", () => focus(null, "Tap a room to see where its bands go, or a stream for the bands in it."));
  focus(null, "Tap a room to see where its bands go, or a stream for the bands in it.");
}

load();
