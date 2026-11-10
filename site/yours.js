// Yours: the bands you follow or hide and the rooms you follow, shared by every page.
//
// They live in the repo (data/yours/<profile>.json), so every device and every browser sees
// the same lists, and re-adding the home-screen app loses nothing. Reading needs no key: the
// file is public. Saving needs a GitHub fine-grained token for this one repo (Contents: read
// and write), pasted once per device on the Yours page and kept in that browser only.
//
// Follow is a watchlist: it never changes a score (CLAUDE.md, Product). Hide removes the band
// from every list for good; it doesn't affect any other band.

const Yours = (() => {
  const REPO = "quepol/next-big-thing";
  const PROFILE = "quepol";
  const PATH = `data/yours/${PROFILE}.json`;
  const LOCAL = "nbt.yours"; // last copy seen, so pages render before the network answers
  const TOKEN = "nbt.ghToken";
  const OLD_VOTES = "nbt.votes", OLD_ROOMS = "nbt.rooms"; // before 2026-11-10: this browser only

  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const keyOf = (name) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const empty = () => ({ version: 1, bands: {}, rooms: null });

  let state = ls.get(LOCAL, null) || empty();
  let sha = null; // the remote file's version, needed to save over it
  let status = "local"; // local | synced | saving | error | nokey | badkey
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f(state, status));

  // Votes and rooms saved in this browser before the shared file existed carry over once:
  // 👍 becomes Follow, 👎 becomes Hide.
  function migrate(s) {
    const votes = ls.get(OLD_VOTES, null);
    let changed = false;
    if (votes) {
      for (const [k, v] of Object.entries(votes)) {
        if (!s.bands[k] && v?.v) {
          s.bands[k] = { artist: v.artist || k, state: v.v === "down" ? "hide" : "follow", at: v.at || new Date().toISOString(), tier: v.tier };
          changed = true;
        }
      }
    }
    const oldRooms = ls.get(OLD_ROOMS, null);
    if (!s.rooms && oldRooms) { s.rooms = oldRooms; changed = true; }
    return changed;
  }

  const token = () => ls.get(TOKEN, "");
  const api = (path, init = {}) => fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    ...init,
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(init.headers || {}) },
  });
  const decode = (b64) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0))));
  const encode = (obj) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj, null, 2) + "\n")));

  // The file as it is on GitHub now: { data, sha }, or { data: null } when it doesn't exist yet.
  async function fetchRemote() {
    if (token()) {
      const r = await api(PATH);
      if (r.status === 404) return { data: null, sha: null };
      if (r.status === 401 || r.status === 403) throw Object.assign(new Error("bad key"), { badKey: true });
      if (!r.ok) throw new Error(`GitHub said ${r.status}`);
      const j = await r.json();
      return { data: decode(j.content), sha: j.sha };
    }
    // No key: the public raw file. It can lag a few minutes behind a save.
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${PATH}?t=${Date.now()}`, { cache: "no-store" });
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new Error(`GitHub said ${r.status}`);
    return { data: await r.json(), sha: null };
  }

  async function load() {
    try {
      const { data, sha: s } = await fetchRemote();
      sha = s;
      state = data ? { ...empty(), ...data } : state;
      const changed = migrate(state);
      ls.set(LOCAL, state);
      status = token() ? "synced" : "nokey";
      emit();
      if ((changed || !data) && token()) save();
    } catch (e) {
      status = e.badKey ? "badkey" : "error";
      emit();
    }
  }

  // Saves the whole file. If another device saved first, re-reads it, re-applies this
  // device's pending changes on top, and tries again.
  let pending = [];
  let timer = null;
  function change(fn) {
    fn(state);
    pending.push(fn);
    ls.set(LOCAL, state);
    emit();
    clearTimeout(timer);
    timer = setTimeout(save, 600);
  }
  async function save(attempt = 0) {
    if (!token()) { status = "nokey"; emit(); return; }
    status = "saving";
    emit();
    const ops = pending;
    pending = [];
    try {
      const body = { message: `Yours: update ${PROFILE}'s follows and hides`, content: encode(state), ...(sha ? { sha } : {}) };
      const r = await api(PATH, { method: "PUT", body: JSON.stringify(body) });
      if ((r.status === 409 || r.status === 422) && attempt < 3) {
        const { data, sha: s } = await fetchRemote();
        sha = s;
        state = data ? { ...empty(), ...data } : empty();
        ops.forEach((fn) => fn(state));
        pending = ops.concat(pending);
        return save(attempt + 1);
      }
      if (r.status === 401 || r.status === 403) throw Object.assign(new Error("bad key"), { badKey: true });
      if (!r.ok) throw new Error(`GitHub said ${r.status}`);
      sha = (await r.json()).content.sha;
      ls.set(LOCAL, state);
      status = "synced";
    } catch (e) {
      pending = ops.concat(pending);
      status = e.badKey ? "badkey" : "error";
    }
    emit();
  }

  return {
    keyOf,
    load,
    onChange(f) { listeners.add(f); },
    get status() { return status; },
    get hasKey() { return !!token(); },
    setKey(t) {
      if (t) ls.set(TOKEN, t.trim()); else ls.del(TOKEN);
      return load();
    },
    band(artist) { return state.bands[keyOf(artist)]?.state || null; },
    bands(which) {
      return Object.values(state.bands).filter((b) => b.state === which)
        .sort((a, b) => a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" }));
    },
    // which: "follow" | "hide" | null (clear). tier is kept for the ledger (#12).
    // Tapping the current state again clears it. The target is fixed here, so re-applying
    // the change after a save conflict can't flip it back.
    setBand(artist, which, tier) {
      const k = keyOf(artist);
      const target = which && state.bands[k]?.state !== which ? which : null;
      const entry = target && { artist, state: target, at: new Date().toISOString(), ...(tier ? { tier } : {}) };
      change((s) => { if (entry) s.bands[k] = entry; else delete s.bands[k]; });
    },
    rooms(fallback) { return state.rooms || fallback; },
    setRooms(list) { change((s) => { s.rooms = [...list]; }); },
  };
})();
