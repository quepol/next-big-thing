// The rooms you follow and how a show in one of them is scored, for app.js (the Your rooms
// tab). explore.js uses only the calendar helpers. Needs ladder.js (movingUp) loaded first.
// The calendar (every upcoming show with per-act taste scores) comes from the daily
// pipeline; before its first run with that field, only shows that made the picks appear.

const ROOMS_KEY = "nbt.rooms";
const DEFAULT_ROOMS = ["phoenix concert theatre", "mod club", "opera house", "horseshoe tavern",
  "concert hall", "adelaide hall", "drake underground"];
const ROOM_ALIASES = { "axis club": "mod club" }; // setlist.fm logs the Mod Club under both names
// Show score = best act's taste fit plus these bonuses. Kept in one place to tune.
const WEIGHTS = { know: 0.4, heard: 0.15, seen: 0.2, movingUp: 0.25, cameBack: 0.1, sfLink: 0.1 };
const KNOW_DAYS = 3;

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

// Upcoming shows grouped by room key.
function roomsByKey(digest) {
  const { rows, full } = calendarRows(digest);
  const today = localDay();
  const byRoom = new Map();
  for (const r of rows) {
    if (r.starts_at.slice(0, 10) < today) continue;
    const k = roomKey(r.venue.name);
    if (!byRoom.has(k)) byRoom.set(k, { name: r.venue.name.trim(), cap: r.venue.capacity, rows: [] });
    byRoom.get(k).rows.push(r);
  }
  return { byRoom, full };
}

// What a show score draws on beyond the digest: attended shows (from the digest) and the
// venue research (repeat and SF-shared artists). Without the research, those bonuses are 0.
function showContext(digest, research) {
  const seen = new Map();
  for (const r of digest.attended_ledger || []) {
    const k = norm(r.artist);
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(r);
  }
  return {
    seen,
    repeat: new Map((research?.repeat_artists || []).map((a) => [norm(a.artist), a])),
    shared: new Map((research?.shared_artists || []).map((a) => [norm(a.artist), a])),
  };
}

// ctx: { seen, repeat, shared } maps keyed by norm(artist).
function scoreShow(row, ctx) {
  let taste = 0, best = null;
  for (const act of row.acts) {
    if (act.skipped) continue;
    if ((act.affinity || 0) > taste) { taste = act.affinity; best = act; }
  }
  const chips = [];
  if (best?.why) {
    const names = best.why.replace(/^similar to /, "").replace(/ \(\d\.\d+\)/g, "").split(", ");
    chips.push(best.why.startsWith("similar to") ? `Like ${names.slice(0, 2).join(", ")}` : best.why.replace(/^tags match your taste: /, "Tags: "));
  }
  const bonuses = [];
  const add = (w, text) => { bonuses.push({ w, text }); chips.push(text); };
  // Chips about the headliner skip the name; chips about an opener lead with it.
  const head = row.acts[0]?.artist;
  const who = (a, text) => (a === head ? text : `${a}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
  const known = row.acts.find((a) => (a.days || 0) >= KNOW_DAYS);
  const heard = row.acts.find((a) => a.days && a.days < KNOW_DAYS);
  if (known) add(WEIGHTS.know, who(known.artist, `You know them · ${known.days} days`));
  else if (heard) add(WEIGHTS.heard, who(heard.artist, "Heard before"));
  const seen = row.acts.find((a) => ctx.seen.has(norm(a.artist)));
  if (seen) add(WEIGHTS.seen, who(seen.artist, "You've seen them"));
  const rep = row.acts.map((a) => ctx.repeat.get(norm(a.artist))).find(Boolean);
  if (rep && movingUp(rep)) add(WEIGHTS.movingUp, who(rep.artist, "Moving up"));
  else if (rep) add(WEIGHTS.cameBack, who(rep.artist, "Keeps coming back"));
  const sf = row.acts.map((a) => ctx.shared.get(norm(a.artist))).find(Boolean);
  if (sf) add(WEIGHTS.sfLink, who(sf.artist, `Played ${sf.sf[0]}${sf.sf.length > 1 ? ` +${sf.sf.length - 1}` : ""}`));
  const bonus = bonuses.reduce((n, b) => n + b.w, 0);
  return { score: taste + bonus, taste, bonus, best, bonuses, chips };
}
