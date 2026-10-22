// Shared by venues.js, explore.js and app.js: helpers plus the billing and venue-ladder rules.
// Capacities come from data/toronto_capacity.json, keyed by lowercased setlist.fm venue
// name: a number, or a label ("Arena", "Festival", "Outdoor") for spaces too big or too
// variable to give one.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const fmt = (n) => n.toLocaleString();
// "YYYY-MM-DD" for a day in local time, n days from today. toISOString() is UTC, which is
// already tomorrow on a Toronto evening.
const localDay = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((x) => String(x).padStart(2, "0")).join("-");
};
const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").normalize("NFKD").replace(/[^a-z0-9']+/g, " ").trim();
// Scores on one scale: every tab's raw score maps onto 1–10, so 8+ is Strong and 5+ is Good
// everywhere. Each tab keeps its own raw scale (know = log(1 + days played)); these anchors
// pin the raw values that become 1, 5, 8 and 10, with straight lines between them (0 → 0
// below the floor) and 10 as a ceiling. Floors and ceilings are from the score history of
// the first 11 digests (Oct 2026); recheck next big thing once velocity switches on.
const SCALES = {
  next_big_thing: [0.10, 0.25, 0.35, 0.50],
  would_like: [0.35, 0.45, 0.55, 0.70],
  know: [Math.log1p(3), 1.8, 2.5, Math.log1p(50)], // 3, ~5, ~11 and 50 days played
  rooms: [0.15, 0.30, 0.50, 0.90], // Your rooms show score (rooms.js); below 1.0, no label
};
const SCALE_POINTS = [1, 5, 8, 10];
const LEVELS = [{ pips: 3, label: "Strong" }, { pips: 2, label: "Good" }, { pips: 1, label: "Worth a look" }, { pips: 0, label: "Long shot" }];

// Raw score → 0.0–10.0, rounded to one decimal so the label always matches the number shown.
function scoreOf10(tier, raw) {
  const a = SCALES[tier];
  if (!a) return null;
  let n;
  if (raw <= a[0]) n = Math.max(0, raw / a[0]);
  else if (raw >= a[3]) n = 10;
  else {
    const i = raw < a[1] ? 0 : raw < a[2] ? 1 : 2;
    n = SCALE_POINTS[i] + ((raw - a[i]) / (a[i + 1] - a[i])) * (SCALE_POINTS[i + 1] - SCALE_POINTS[i]);
  }
  return Math.round(n * 10) / 10;
}

// { pips, label, n } for a raw score; n is the 1–10 number to display.
function strengthOf(tier, raw) {
  const n = scoreOf10(tier, raw);
  // 8+ Strong, 5+ Good, 3+ Worth a look, below 3 Long shot (barely over a tab's entry bar).
  return { ...(n >= 8 ? LEVELS[0] : n >= 5 ? LEVELS[1] : n >= 3 ? LEVELS[2] : LEVELS[3]), n };
}

const fmtListeners = (n) => `${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)} listeners`;

const SMALL_LISTENERS = 250000; // "next big thing" territory for the comeback list
const SUSPECT_LISTENERS = 3000; // below this, the Last.fm match is often the wrong artist
const LADDER_MAX = 2765; // Massey Hall. Up to here a band is taken to be headlining;
                         // anything bigger (amphitheatres, arenas, stadiums, festivals)
                         // is taken to be a support slot and left off the ladder.
let CAPS = {}; // Toronto capacities by lowercased venue name
const setCaps = (caps) => { CAPS = caps; };
// Billing per show: from the co-bill when setlist.fm logged other acts that night (the
// act with the most Last.fm listeners is taken as headliner); otherwise assumed from
// room size, with anything bigger than Massey Hall (or a labelled arena/festival
// space) taken as a support slot.
const bySize = (sh) => {
  const c = CAPS[sh.venue.toLowerCase()];
  return typeof c === "string" || c > LADDER_MAX ? "support" : "headline";
};
const billing = (sh) => sh.billing || bySize(sh);
const isSupport = (sh) => billing(sh) === "support";

// Moving up: a later headline show (Massey size or smaller) in a room at least 25%
// bigger than the first.
const movingUp = (a) => {
  const heads = a.shows.filter((sh) => billing(sh) === "headline" && sh.cap);
  return heads.length > 1 && heads.slice(1).some((sh) => sh.cap >= heads[0].cap * 1.25);
};

