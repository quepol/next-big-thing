const VOTES_KEY = "nbt.votes";
const TAB_KEY = "nbt.tab";
const SORT_KEY = "nbt.sort";
const TIERS = ["next_big_thing", "would_like", "know"];
const TABS = ["soon", ...TIERS, "rooms"];
const FOLLOWED = "__followed"; // the default view: every room you follow
const EVERY = "__every"; // every room with upcoming shows, from the dropdown
const ROOM_LIMIT = 25; // shows on the Your rooms tab before "Show all"
const tabs = document.getElementById("tabs");

const GROWTH_DAYS = 28; // nbt/config.py velocity_min_weeks × 7

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

const EMPTY = {
  next_big_thing: "No up-and-comers flagged right now. Check back after the next daily run.",
  would_like: "Nothing here yet.",
  know: "None of your artists are playing nearby in the next 90 days.",
  rooms: "No upcoming shows found here.",
  soon: "None of your picks are playing tonight or tomorrow.",
};

// Strength labels per tab: each tier scores on its own scale (know = log(1 + days played)).
// Tune these here; the raw score is always shown next to the label.
const STRENGTH = {
  next_big_thing: { strong: 0.35, good: 0.25 },
  would_like: { strong: 0.55, good: 0.45 },
  know: { strong: 2.5, good: 1.8 },
  // Your rooms: show score (rooms.js). It lists every show, quiet nights included, so
  // below `look` gets no label at all. Oct 22: 10 of 104 followed-room shows were Strong.
  rooms: { strong: 0.5, good: 0.3, look: 0.15 },
};
const LEVELS = [
  { pips: 3, label: "Strong" },
  { pips: 2, label: "Good" },
  { pips: 1, label: "Worth a look" },
];

function strengthOf(tier, score) {
  const t = STRENGTH[tier];
  if (!t) return LEVELS[2];
  score = Math.round(score * 100) / 100; // rate the score as shown: 0.2996 reads 0.30, so it's Good
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
// Your rooms: shows at the rooms you follow, scored by rooms.js. Following filters; it never adds to a score.
const rooms = { byRoom: new Map(), full: true, ctx: null, followed: [], room: FOLLOWED, all: false };

async function getJSON(url, fallback) {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

async function load() {
  let demo = false;
  const [real, research, caps] = await Promise.all([
    getJSON("data/digest.json", null),
    getJSON("data/venue_research.json", null),
    getJSON("data/toronto_capacity.json", {}),
  ]);
  digest = real;
  if (!digest) {
    digest = await getJSON("data/demo.json", {});
    demo = true;
  }
  setCaps(caps);
  Object.assign(rooms, roomsByKey(digest), { ctx: showContext(digest, research), followed: store.get(ROOMS_KEY, DEFAULT_ROOMS) });
  const s = digest.stats || {};
  // "Updated Mon 6:01 AM": the weekday says whether today's run has landed.
  const updated = new Date(digest.generated_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  // Listener growth needs 4 weeks of daily snapshots (velocity_min_weeks); count up to it, then drop the note.
  const growth = s.snapshot_days < GROWTH_DAYS ? ` · Growth tracking: day ${fmtNum(s.snapshot_days)} of ${GROWTH_DAYS}` : "";
  document.getElementById("meta").textContent =
    `Updated ${updated} · ${fmtNum(s.events)} upcoming shows checked against ${fmtNum(s.known_artists)} bands you know${growth}`;
  if (demo) {
    const b = document.getElementById("banner");
    b.innerHTML = "<div>Showing <strong>demo data</strong> with made-up bands. The real digest appears after the first pipeline run.</div>";
    b.hidden = false;
  }
  select(currentTab());
}

const currentTab = () => { const t = store.get(TAB_KEY, TIERS[0]); return TABS.includes(t) ? t : TIERS[0]; };

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
  document.getElementById("toolbar").hidden = false;
  document.getElementById("roombar").hidden = tier !== "rooms";
  document.getElementById("follow").hidden = true;
  if (tier === "rooms") return renderRooms(list);
  const picks = tier === "soon" ? soonPicks() : digest.picks?.[tier] || [];
  document.getElementById("count").textContent = `${picks.length} pick${picks.length === 1 ? "" : "s"}`;
  if (!picks.length) return list.append(el("p", "empty", EMPTY[tier]));
  sorted(picks).forEach((p) => list.append(renderPick(p)));
}

// Soon: picks from all three tiers playing tonight or tomorrow. Tier scores are on
// different scales, so "Best match" here means tonight first, then tier order, then score.
function soonPicks() {
  const days = [localDay(0), localDay(1)];
  return TIERS.flatMap((tier) => digest.picks?.[tier] || [])
    .filter((p) => days.includes(p.event.starts_at.slice(0, 10)))
    .sort((a, b) => a.event.starts_at.slice(0, 10).localeCompare(b.event.starts_at.slice(0, 10))
      || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || b.score - a.score)
    .map((p) => ({ ...p, soon: true }));
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
  return voteOf(p) === "down" ? renderCollapsed(p) : p.show ? renderShowCard(p) : renderCard(p);
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

  // Chips: the scannable facts, led by the tier on Soon
  const chips = node.querySelector(".chips");
  if (p.soon) chips.append(el("li", "hot", TIER_NAMES[p.tier]));
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

  fillFoot(node, p);
  return node;
}

// Footer: listen links, tickets, votes
function fillFoot(node, p) {
  const ev = p.event;
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
}

// ---------- Your rooms ----------
// Every upcoming show at the rooms you follow, as the same cards as the tiers. A show is
// scored by rooms.js (best act's taste + bonuses); when it is also one of today's picks,
// the card says which tier, and a Strong pick keeps its pink edge.

const TIER_NAMES = { next_big_thing: "Next big thing", would_like: "You'd probably like", know: "Bands you know" };
let showPicks; // today's picks by event id + artist, best tier first

function pickFor(row) {
  if (!showPicks) {
    showPicks = new Map();
    for (const tier of TIERS) for (const p of digest.picks?.[tier] || []) {
      const k = `${p.event.id}|${norm(p.artist)}`;
      if (!showPicks.has(k)) showPicks.set(k, p);
    }
  }
  const found = row.acts.map((a) => showPicks.get(`${row.id}|${norm(a.artist)}`)).filter(Boolean);
  return found.sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))[0];
}

// A calendar row as a pick-shaped object, so sorting, votes and the card footer work as on the tiers.
function showItem(row) {
  const head = row.acts[0];
  return {
    show: scoreShow(row, rooms.ctx), row, pick: pickFor(row),
    artist: head.artist, listeners: head.listeners, tier: "rooms",
    event: { id: row.id, starts_at: row.starts_at, url: row.url, venue: row.venue, region: row.region, lineup: row.acts.map((a) => a.artist) },
    get score() { return this.show.score; },
  };
}

function renderRooms(list) {
  renderRoomChips();
  const all = rooms.room === FOLLOWED;
  const keys = all ? rooms.followed : rooms.room === EVERY ? [...rooms.byRoom.keys()] : [rooms.room];
  const items = keys.flatMap((k) => rooms.byRoom.get(k)?.rows || []).map(showItem)
    .sort((a, b) => b.score - a.score || a.event.starts_at.localeCompare(b.event.starts_at));
  const count = document.getElementById("count");
  count.textContent = `${items.length} show${items.length === 1 ? "" : "s"}`;
  if (!all && rooms.room !== EVERY) {
    const following = rooms.followed.includes(rooms.room);
    const btn = document.getElementById("follow");
    btn.hidden = false;
    btn.textContent = following ? "★ Following" : "☆ Follow";
    btn.setAttribute("aria-pressed", following);
  }
  if (!rooms.full) list.append(el("p", "muted small", "Showing only shows that made your picks. Every show at each room appears after the next daily update."));
  if (!items.length) return list.append(el("p", "empty", all && !rooms.followed.length ? "You don't follow any rooms yet. Pick one under “Another room…” and follow it." : EMPTY.rooms));
  const shown = sorted(items).slice(0, rooms.all ? Infinity : ROOM_LIMIT);
  shown.forEach((p) => list.append(renderPick(p)));
  if (items.length > shown.length) {
    const more = el("button", "more", `Show all ${items.length} shows`);
    more.type = "button";
    more.addEventListener("click", () => { rooms.all = true; select("rooms"); });
    list.append(more);
  }
}

function renderRoomChips() {
  const box = document.getElementById("roomchips");
  box.replaceChildren();
  const chip = (key, label, n) => {
    const b = el("button", "roomchip", label);
    b.type = "button";
    b.setAttribute("aria-pressed", rooms.room === key);
    b.append(el("span", "n", ` ${n}`));
    b.addEventListener("click", () => pickRoom(key));
    box.append(b);
  };
  const size = (k) => rooms.byRoom.get(k)?.rows.length || 0;
  chip(FOLLOWED, "Followed rooms", rooms.followed.reduce((n, k) => n + size(k), 0));
  for (const k of rooms.followed) {
    const r = rooms.byRoom.get(k);
    // Short names keep the chips to fewer lines on a phone: "Phoenix Concert Theatre" → "Phoenix".
    chip(k, r ? r.name.trim().replace(/^The /, "").replace(/ (Concert Theatre|Tavern)$/, "") : k.replace(/\b\w/g, (c) => c.toUpperCase()), size(k));
  }
  // Every other room, with "All rooms" first. A room picked here shows as the select's value.
  const sel = el("select", "roomadd");
  sel.setAttribute("aria-label", "Another room");
  sel.append(new Option("Another room…", ""));
  sel.append(new Option(`All rooms (${[...rooms.byRoom.keys()].reduce((n, k) => n + size(k), 0)})`, EVERY));
  [...rooms.byRoom.entries()].filter(([k]) => !rooms.followed.includes(k))
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([k, r]) => sel.append(new Option(`${r.name} (${r.rows.length})`, k)));
  sel.addEventListener("change", () => { if (sel.value) pickRoom(sel.value); });
  if (rooms.room !== FOLLOWED && !rooms.followed.includes(rooms.room)) sel.value = rooms.room;
  box.append(sel);
}

function pickRoom(key) {
  rooms.room = key;
  rooms.all = false;
  select("rooms");
}

function renderShowCard(p) {
  const node = document.getElementById("card").content.firstElementChild.cloneNode(true);
  const { show, pick, event: ev } = p;
  fillDate(node, ev.starts_at);
  node.querySelector(".artist").textContent = p.artist;

  // Strength: the show score on its own scale (STRENGTH.rooms); weak matches get the number
  // only. The pink edge stays a Strong *pick*'s, so pink keeps meaning the same thing.
  if (Math.round(show.score * 100) / 100 >= STRENGTH.rooms.look) {
    const lvl = strengthOf("rooms", show.score);
    node.querySelectorAll(".pips i").forEach((i, n) => i.classList.toggle("on", n < lvl.pips));
    node.querySelector(".label").textContent = lvl.label;
  } else {
    node.querySelector(".pips").remove();
    node.querySelector(".label").remove();
  }
  node.classList.toggle("strong", !!pick && strengthOf(pick.tier, pick.score).pips === 3);
  const score = node.querySelector(".score");
  score.textContent = show.score.toFixed(2);
  node.querySelector(".strength").title = `Taste ${show.taste.toFixed(2)} + bonuses ${show.bonus.toFixed(2)}`;

  // Where: venue · capacity · region (if not Toronto) · the rest of the bill
  const where = node.querySelector(".where");
  where.append(el("span", "venue", ev.venue.name));
  if (ev.venue.capacity) where.append(` · ~${ev.venue.capacity.toLocaleString()} cap`);
  if (ev.region && ev.region !== "Toronto") where.append(" · ", el("span", "region", ev.region));
  if (ev.lineup.length > 1) where.append(` · with ${ev.lineup.slice(1).join(", ")}`);

  // Chips: which tier picked it (if any), then listeners
  const chips = node.querySelector(".chips");
  if (pick) chips.append(el("li", "hot", pick.artist === p.artist ? TIER_NAMES[pick.tier] : `${pick.artist}: ${TIER_NAMES[pick.tier]}`));
  if (p.listeners != null) chips.append(el("li", null, `${fmtCompact(p.listeners)} listeners`));

  // Why: the taste behind the score (with weights), then each bonus and its weight
  const why = node.querySelector(".why");
  const best = show.best;
  if (best?.why) {
    const li = el("li");
    const lead = best.artist === p.artist ? "" : `${best.artist}: `;
    const w = parseReasons([best.why]).why[0];
    if (w?.kind === "similar") {
      li.append(el("span", "k", `${lead}Similar to `));
      w.pairs.forEach((x, i) => { if (i) li.append(", "); li.append(x.name, el("span", "w", x.w)); });
    } else if (w?.kind === "tags") {
      li.append(el("span", "k", `${lead}Tags: `), w.tags.join(" · "));
    } else {
      li.append(lead + best.why);
    }
    why.append(li);
  }
  if (show.bonuses.length) {
    const li = el("li");
    li.append(el("span", "k", "Bonus: "));
    show.bonuses.forEach((b, i) => { if (i) li.append(", "); li.append(b.text, el("span", "w", `+${b.w.toFixed(2)}`)); });
    why.append(li);
  }

  fillFoot(node, p);
  return node;
}

const sortSel = document.getElementById("sort");
sortSel.value = store.get(SORT_KEY, "score");
sortSel.addEventListener("change", () => {
  store.set(SORT_KEY, sortSel.value);
  select(currentTab());
});

tabs.addEventListener("click", (e) => {
  const tier = e.target.closest("button")?.dataset.tier;
  if (tier) select(tier);
});

document.getElementById("follow").addEventListener("click", () => {
  const k = rooms.room;
  rooms.followed = rooms.followed.includes(k) ? rooms.followed.filter((x) => x !== k) : [...rooms.followed, k];
  store.set(ROOMS_KEY, rooms.followed);
  select("rooms");
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
