const VOTES_KEY = "nbt.votes";
const TAB_KEY = "nbt.tab";
const SORT_KEY = "nbt.sort";
const THEME_KEY = "nbt.theme";
const CARD_TIERS = ["next_big_thing", "would_like", "know"];
const tabs = document.getElementById("tabs");

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const fmtNum = (n) => (n == null ? "—" : n.toLocaleString());
const fmtCompact = (n) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
const keyOf = (name) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});

const EMPTY = {
  next_big_thing: "No up-and-comers flagged right now. Check back after the next daily run.",
  would_like: "Nothing here yet.",
  know: "None of your artists are playing nearby in the next 90 days.",
  ledger: "The ledger fills up as next-big-thing picks are flagged. Check back in a few months to see who blew up.",
  attended: "No attended shows found. Check that SETLISTFM_API_KEY is set and the setlist.fm user has logged shows.",
};

// Strength labels per tab: each tier scores on its own scale (know = log(1 + days played)).
// Tune these here; the raw score is always shown next to the label.
const STRENGTH = {
  next_big_thing: { strong: 0.35, good: 0.25 },
  would_like: { strong: 0.55, good: 0.45 },
  know: { strong: 2.5, good: 1.8 },
};
const LEVELS = [
  { pips: 3, label: "Strong" },
  { pips: 2, label: "Good" },
  { pips: 1, label: "Worth a look" },
];

function strengthOf(tier, score) {
  const t = STRENGTH[tier];
  if (!t) return LEVELS[2];
  return score >= t.strong ? LEVELS[0] : score >= t.good ? LEVELS[1] : LEVELS[2];
}

// Turn the pipeline's reason strings (nbt/scoring.py, nbt/taste.py) into structured
// pieces. Anything unrecognised is kept verbatim in `other`, so new reasons still show.
function parseReasons(reasons) {
  const out = { chips: [], why: [], other: [], venueCap: null, billShare: null, listeners: null };
  for (const r of reasons) {
    let m;
    if ((m = r.match(/^similar to (.+)$/))) {
      const pairs = [...m[1].matchAll(/(.+?) \((\d+\.\d+)\)(?:, |$)/g)].map((x) => ({ name: x[1], w: x[2] }));
      out.why.push(pairs.length ? { kind: "similar", pairs } : { kind: "text", text: r });
    } else if ((m = r.match(/^tags match your taste: (.+)$/))) {
      out.why.push({ kind: "tags", tags: m[1].split(/,\s*/) });
    } else if ((m = r.match(/^only ([\d,]+) listeners on Last\.fm$/))) {
      out.listeners = Number(m[1].replace(/,/g, ""));
    } else if (r === "no Last.fm footprint yet") {
      out.chips.push({ text: "No Last.fm footprint", hot: true });
    } else if ((m = r.match(/^small venue \(~([\d,]+) cap\.\)$/))) {
      out.venueCap = Number(m[1].replace(/,/g, ""));
    } else if (/^you've never been to /.test(r)) {
      out.chips.push({ text: "New venue for you" });
    } else if ((m = r.match(/^played on (\d+) days since (\d{4}) \((\d+) plays\)$/))) {
      out.chips.push({ text: `${m[1]} days since ${m[2]} · ${Number(m[3]).toLocaleString()} plays` });
    } else if (r === "one of your most-played artists") {
      out.chips.push({ text: "Most-played", hot: true });
    } else if ((m = r.match(/^you played them on (\d+) days? back in (\d{4})$/))) {
      out.chips.push({ text: `Heard ${m[1]} day${m[1] === "1" ? "" : "s"} · ${m[2]}` });
    } else if ((m = r.match(/^sharing the bill with (.+) \((\d+) days played\)$/))) {
      out.billShare = { name: m[1], days: m[2] };
    } else if ((m = r.match(/^\+(\d+) more dates? nearby$/))) {
      out.chips.push({ text: `+${m[1]} more date${m[1] === "1" ? "" : "s"}` });
    } else if ((m = r.match(/^listeners growing ([+-][\d.]+%)\/week over (\d+) weeks$/))) {
      out.chips.push({ text: `Growing ${m[1]}/wk`, hot: true });
    } else {
      out.other.push(r);
    }
  }
  return out;
}

const ICONS = {
  music: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5v7.8a2.5 2.5 0 1 0 1.5 2.3V5.2l5-1.1v4.7a2.5 2.5 0 1 0 1.5 2.3V1.6z"/></svg>',
  youtube: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M15.2 4.3a2 2 0 0 0-1.4-1.4C12.6 2.6 8 2.6 8 2.6s-4.6 0-5.8.3A2 2 0 0 0 .8 4.3 21 21 0 0 0 .5 8a21 21 0 0 0 .3 3.7 2 2 0 0 0 1.4 1.4c1.2.3 5.8.3 5.8.3s4.6 0 5.8-.3a2 2 0 0 0 1.4-1.4A21 21 0 0 0 15.5 8a21 21 0 0 0-.3-3.7zM6.5 10.3V5.7L10.4 8z"/></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 7h2.5v7H2zm3.5 7V7.4L8.6 1.5c.9 0 1.6.8 1.4 1.7L9.5 6H13a1.5 1.5 0 0 1 1.5 1.8l-1.1 5A1.5 1.5 0 0 1 12 14z"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14 9h-2.5V2H14zm-3.5-7v6.6L7.4 14.5c-.9 0-1.6-.8-1.4-1.7L6.5 10H3a1.5 1.5 0 0 1-1.5-1.8l1.1-5A1.5 1.5 0 0 1 4 2z"/></svg>',
};

let digest;

async function load() {
  let demo = false;
  let res = await fetch("data/digest.json", { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) {
    res = await fetch("data/demo.json");
    demo = true;
  }
  digest = await res.json();
  const s = digest.stats || {};
  document.getElementById("meta").textContent =
    `Updated ${new Date(digest.generated_at).toLocaleString()} · ${fmtNum(s.events)} shows scanned · ` +
    `${fmtNum(s.known_artists)} artists you know · ${fmtNum(s.snapshot_days)} days of listener history`;
  if (demo) {
    const b = document.getElementById("banner");
    b.innerHTML = "<div>Showing <strong>demo data</strong> with made-up bands. The real digest appears after the first pipeline run.</div>";
    b.hidden = false;
  }
  select(store.get(TAB_KEY, "next_big_thing"));
}

function sorted(picks) {
  const by = store.get(SORT_KEY, "score");
  const list = [...picks];
  const cmp = {
    date: (a, b) => a.event.starts_at.localeCompare(b.event.starts_at) || b.score - a.score,
    venue: (a, b) => a.event.venue.name.localeCompare(b.event.venue.name) || a.event.starts_at.localeCompare(b.event.starts_at),
    artist: (a, b) => a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" }),
  }[by];
  return cmp ? list.sort(cmp) : list; // "score": the digest is already in best-match order
}

function select(tier) {
  for (const b of tabs.querySelectorAll("button")) {
    const on = b.dataset.tier === tier;
    b.setAttribute("aria-selected", on);
    if (on) b.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  store.set(TAB_KEY, tier);
  const list = document.getElementById("list");
  list.replaceChildren();
  document.getElementById("toolbar").hidden = !CARD_TIERS.includes(tier);
  if (tier === "ledger") return renderLedger(list);
  if (tier === "attended") return renderAttended(list);
  const picks = digest.picks?.[tier] || [];
  document.getElementById("count").textContent = `${picks.length} pick${picks.length === 1 ? "" : "s"}`;
  if (!picks.length) return list.append(el("p", "empty", EMPTY[tier]));
  sorted(picks).forEach((p) => list.append(renderPick(p)));
}

function voteOf(p) {
  return store.get(VOTES_KEY, {})[keyOf(p.artist)]?.v;
}

function setVote(p, v) {
  const all = store.get(VOTES_KEY, {});
  const k = keyOf(p.artist);
  if (!v || all[k]?.v === v) delete all[k];
  else all[k] = { v, artist: p.artist, tier: p.tier, at: new Date().toISOString() };
  store.set(VOTES_KEY, all);
}

function renderPick(p) {
  return voteOf(p) === "down" ? renderCollapsed(p) : renderCard(p);
}

function replaceWith(node, p) {
  const next = renderPick(p);
  node.replaceWith(next);
  next.querySelector("button")?.focus();
}

function renderCollapsed(p) {
  const node = document.getElementById("collapsed").content.firstElementChild.cloneNode(true);
  node.querySelector(".c-date").textContent = fmtDate(p.event.starts_at);
  node.querySelector(".c-artist").textContent = p.artist;
  node.querySelector(".undo").addEventListener("click", () => { setVote(p, null); replaceWith(node, p); });
  return node;
}

function fillDate(node, iso) {
  const d = new Date(iso);
  if (isNaN(d)) return;
  node.querySelector(".dow").textContent = d.toLocaleDateString(undefined, { weekday: "short" });
  node.querySelector(".day").textContent = d.getDate();
  node.querySelector(".mon").textContent = d.toLocaleDateString(undefined, { month: "short" });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86400000);
  node.querySelector(".rel").textContent = days === 0 ? "Tonight" : days === 1 ? "Tmrw" : "";
}

function renderCard(p) {
  const node = document.getElementById("card").content.firstElementChild.cloneNode(true);
  const info = parseReasons(p.reasons);
  const ev = p.event;
  fillDate(node, ev.starts_at);

  // Header: artist + strength (pips, label, raw score)
  node.querySelector(".artist").textContent = p.artist;
  const lvl = strengthOf(p.tier, p.score);
  node.classList.toggle("strong", lvl.pips === 3);
  node.querySelectorAll(".pips i").forEach((i, n) => i.classList.toggle("on", n < lvl.pips));
  node.querySelector(".label").textContent = lvl.label;
  node.querySelector(".score").textContent = p.score.toFixed(2);
  node.querySelector(".strength").title = `Score ${p.score.toFixed(3)}`;

  // Where: venue · capacity · region (if not Toronto) · lineup role
  const where = node.querySelector(".where");
  where.append(el("span", "venue", ev.venue.name));
  const cap = info.venueCap ?? ev.venue.capacity;
  if (cap) where.append(` · ~${cap.toLocaleString()} cap`);
  if (ev.region && ev.region !== "Toronto") where.append(" · ", el("span", "region", ev.region));
  const others = ev.lineup.filter((a) => a !== p.artist);
  if (info.billShare) where.append(` · with ${info.billShare.name}`);
  else if (others.length && ev.lineup[0] !== p.artist) where.append(` · opening for ${ev.lineup[0]}`);
  else if (others.length) where.append(` · with ${others.join(", ")}`);

  // Chips: the scannable facts
  const chips = node.querySelector(".chips");
  const listeners = p.listeners ?? info.listeners;
  if (listeners != null && p.tier !== "know") chips.append(el("li", null, `${fmtCompact(listeners)} listeners`));
  for (const c of info.chips) chips.append(el("li", c.hot ? "hot" : null, c.text));

  // Why: similarity (with weights), tags, bill sharing, anything unparsed
  const why = node.querySelector(".why");
  for (const w of info.why) {
    const li = el("li");
    if (w.kind === "similar") {
      li.append(el("span", "k", "Similar to "));
      w.pairs.forEach((x, i) => {
        if (i) li.append(", ");
        li.append(x.name, el("span", "w", x.w));
      });
    } else if (w.kind === "tags") {
      li.append(el("span", "k", "Tags: "), w.tags.join(" · "));
    } else {
      li.textContent = w.text;
    }
    why.append(li);
  }
  if (info.billShare) {
    why.append(el("li", null, `Sharing the bill with ${info.billShare.name}, who you've played on ${info.billShare.days} days`));
  }
  for (const t of info.other) why.append(el("li", null, t));

  // Footer: listen links, tickets, votes
  const enc = encodeURIComponent(p.artist);
  const listen = node.querySelector(".listen");
  for (const [href, icon, label] of [
    [`https://soundcloud.com/search?q=${enc}`, ICONS.music, "SoundCloud"],
    [`https://www.youtube.com/results?search_query=${enc}`, ICONS.youtube, "YouTube"],
  ]) {
    const a = el("a");
    Object.assign(a, { href, target: "_blank", rel: "noopener", title: `${p.artist} on ${label}` });
    a.innerHTML = icon;
    a.append(el("span", "txt", label));
    listen.append(a);
  }
  const tickets = node.querySelector(".tickets");
  if (ev.url) tickets.href = ev.url; else tickets.remove();

  node.querySelectorAll(".vote button").forEach((b) => {
    b.innerHTML = ICONS[b.dataset.v];
    b.setAttribute("aria-pressed", voteOf(p) === b.dataset.v);
    b.addEventListener("click", () => {
      setVote(p, b.dataset.v);
      if (voteOf(p) === "down") return replaceWith(node, p);
      node.querySelectorAll(".vote button").forEach((x) => x.setAttribute("aria-pressed", voteOf(p) === x.dataset.v));
    });
  });
  return node;
}

function renderLedger(list) {
  const rows = digest.ledger || [];
  if (!rows.length) return list.append(el("p", "empty", EMPTY.ledger));
  const wrap = document.createElement("div");
  wrap.className = "ledger-wrap";
  const t = document.createElement("table");
  t.innerHTML = "<thead><tr><th>Artist</th><th>Flagged</th><th class=num>Listeners then</th><th class=num>Now</th><th class=num>Growth</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    const growth = r.listeners_at_flag && r.listeners_now ? `${(r.listeners_now / r.listeners_at_flag).toFixed(1)}×` : "—";
    [r.artist, r.first_flagged, fmtNum(r.listeners_at_flag), fmtNum(r.listeners_now), growth].forEach((v, i) => {
      const td = document.createElement("td");
      td.textContent = v;
      if (i >= 2) td.className = "num";
      tr.append(td);
    });
    body.append(tr);
  }
  t.append(body);
  wrap.append(t);
  list.append(wrap);
}

function renderAttended(list) {
  const rows = digest.attended_ledger || [];
  if (!rows.length) return list.append(el("p", "empty", EMPTY.attended));
  const wrap = document.createElement("div");
  wrap.className = "ledger-wrap";
  const t = document.createElement("table");
  t.innerHTML = "<thead><tr><th>Artist</th><th>Date seen</th><th>Venue</th><th class=num>Listeners now</th></tr></thead>";
  const body = document.createElement("tbody");
  const fmtSlfDate = (s) => {
    // setlist.fm uses DD-MM-YYYY. Build a local date: "YYYY-MM-DD" alone parses as UTC
    // midnight, which shows as the previous day anywhere west of Greenwich.
    const [d, m, y] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  for (const r of rows) {
    const tr = document.createElement("tr");
    [r.artist, fmtSlfDate(r.date), `${r.venue}, ${r.city}`, fmtNum(r.listeners_now)].forEach((v, i) => {
      const td = document.createElement("td");
      td.textContent = v;
      if (i === 3) td.className = "num";
      tr.append(td);
    });
    body.append(tr);
  }
  t.append(body);
  wrap.append(t);
  list.append(wrap);
}

// Theme: Light / Dark / System (auto). Saved per browser.
const themeSwitch = document.getElementById("theme");
const themeButtons = [...themeSwitch.querySelectorAll("button")];
function applyTheme(t) {
  if (t !== "light" && t !== "dark") t = "auto";
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  for (const b of themeButtons) {
    const on = b.dataset.choice === t;
    b.setAttribute("aria-checked", on);
    b.tabIndex = on ? 0 : -1; // radiogroup: one tab stop, arrows move between options
  }
}
function chooseTheme(t, focus) {
  store.set(THEME_KEY, t);
  applyTheme(t);
  if (focus) themeButtons.find((b) => b.dataset.choice === t)?.focus();
}
themeSwitch.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) chooseTheme(b.dataset.choice);
});
themeSwitch.addEventListener("keydown", (e) => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const i = themeButtons.findIndex((b) => b.getAttribute("aria-checked") === "true");
  chooseTheme(themeButtons[(i + step + themeButtons.length) % themeButtons.length].dataset.choice, true);
});
applyTheme(store.get(THEME_KEY, "auto"));

const sortSel = document.getElementById("sort");
sortSel.value = store.get(SORT_KEY, "score");
sortSel.addEventListener("change", () => {
  store.set(SORT_KEY, sortSel.value);
  select(store.get(TAB_KEY, "next_big_thing"));
});

tabs.addEventListener("click", (e) => {
  const tier = e.target.closest("button")?.dataset.tier;
  if (tier) select(tier);
});

// Fade + chevron on whichever side of the tab row has more tabs scrolled out of view.
function updateTabEdges() {
  const max = tabs.scrollWidth - tabs.clientWidth;
  tabs.parentElement.classList.toggle("more-left", tabs.scrollLeft > 2);
  tabs.parentElement.classList.toggle("more-right", tabs.scrollLeft < max - 2);
}
tabs.addEventListener("scroll", updateTabEdges, { passive: true });
window.addEventListener("resize", updateTabEdges);
document.fonts?.ready.then(updateTabEdges);
updateTabEdges();
load();
