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
const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").normalize("NFKD").replace(/[^a-z0-9']+/g, " ").trim();
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

