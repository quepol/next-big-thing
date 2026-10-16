const VOTES_KEY = "nbt.votes";
const TAB_KEY = "nbt.tab";

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const fmtNum = (n) => (n == null ? "—" : n.toLocaleString());
const keyOf = (name) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

const EMPTY = {
  next_big_thing: "No up-and-comers flagged yet. This tier needs the Toronto city feed, which is still being built.",
  would_like: "Nothing here yet.",
  know: "None of your artists are playing nearby in the next 90 days.",
  ledger: "The ledger fills up as next-big-thing picks are flagged. Check back in a few months to see who blew up.",
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

function select(tier) {
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tier === tier));
  store.set(TAB_KEY, tier);
  const list = document.getElementById("list");
  list.replaceChildren();
  if (tier === "ledger") return renderLedger(list);
  const picks = digest.picks?.[tier] || [];
  if (!picks.length) return list.append(Object.assign(document.createElement("p"), { className: "empty", textContent: EMPTY[tier] }));
  picks.forEach((p) => list.append(renderCard(p)));
}

function renderCard(p) {
  const el = document.getElementById("card").content.firstElementChild.cloneNode(true);
  el.querySelector(".date").textContent = fmtDate(p.event.starts_at);
  el.querySelector(".venue").textContent = `${p.event.venue.name} · ${p.event.region || p.event.venue.city}`;
  el.querySelector(".artist").textContent = p.artist;
  const others = p.event.lineup.filter((a) => a !== p.artist);
  const reasons = [...p.reasons];
  if (others.length && !reasons.some((r) => r.startsWith("sharing the bill"))) reasons.push(`on the bill: ${others.join(", ")}`);
  el.querySelector(".reasons").append(...reasons.map((r) => Object.assign(document.createElement("li"), { textContent: r })));
  const link = el.querySelector(".tickets");
  if (p.event.url) link.href = p.event.url; else link.remove();

  const k = keyOf(p.artist);
  const votes = store.get(VOTES_KEY, {});
  const paint = () => {
    const v = store.get(VOTES_KEY, {})[k]?.v;
    el.classList.toggle("down", v === "down");
    el.querySelectorAll(".vote button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v));
  };
  el.querySelectorAll(".vote button").forEach((b) => b.addEventListener("click", () => {
    const all = store.get(VOTES_KEY, {});
    if (all[k]?.v === b.dataset.v) delete all[k];
    else all[k] = { v: b.dataset.v, artist: p.artist, tier: p.tier, at: new Date().toISOString() };
    store.set(VOTES_KEY, all);
    paint();
  }));
  paint(votes);
  return el;
}

function renderLedger(list) {
  const rows = digest.ledger || [];
  if (!rows.length) return list.append(Object.assign(document.createElement("p"), { className: "empty", textContent: EMPTY.ledger }));
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

document.getElementById("tabs").addEventListener("click", (e) => {
  const tier = e.target.closest("button")?.dataset.tier;
  if (tier) select(tier);
});
load();
