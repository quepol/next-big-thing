// Shared footer for every page: Picks and Explore, "Loaded <time> · Refresh", and the
// theme switch. Each page has <footer class="site-foot" data-page="…">. The SF overlap
// page is research, so it's linked only from Explore.

(() => {
  const PAGES = [["picks", "./", "Picks"], ["explore", "explore.html", "Explore"]];
  const THEME_KEY = "nbt.theme";
  const STALE_MS = 60 * 60 * 1000;
  const ICONS = {
    light: '<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"/>',
    dark: '<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/>',
    auto: '<rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.25"/><path d="M5.5 14h5M8 11v3"/>',
  };
  const LABELS = { light: "Light", dark: "Dark", auto: "Match system" };

  const foot = document.querySelector("footer.site-foot");
  if (!foot) return;
  const here = foot.dataset.page;

  const nav = document.createElement("nav");
  nav.className = "foot-pages";
  nav.setAttribute("aria-label", "Pages");
  for (const [key, href, label] of PAGES) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    if (key === here) a.setAttribute("aria-current", "page");
    nav.append(a);
  }

  // Refresh: a home-screen app keeps the page alive and has no reload control. Reload
  // with a throwaway query so the page itself is refetched, not resumed from cache.
  // The hash is kept, so Explore reopens on the same tab.
  const loadedAt = Date.now();
  const refresh = () => location.replace(`${location.pathname}?r=${Date.now()}${location.hash}`);
  const row = document.createElement("div");
  row.className = "foot-row";
  const loaded = document.createElement("span");
  loaded.textContent = `Loaded ${new Date(loadedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "foot-refresh";
  btn.textContent = "Refresh";
  btn.addEventListener("click", refresh);

  // Theme: Light / Dark / System (auto). Saved per browser, shared by every page.
  const sw = document.createElement("div");
  sw.className = "theme-switch";
  sw.setAttribute("role", "radiogroup");
  sw.setAttribute("aria-label", "Colour theme");
  for (const t of ["light", "dark", "auto"]) {
    sw.insertAdjacentHTML("beforeend",
      `<button type="button" role="radio" data-choice="${t}" aria-label="${LABELS[t]}" title="${LABELS[t]}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[t]}</svg></button>`);
  }
  const buttons = [...sw.querySelectorAll("button")];
  const read = () => { try { return JSON.parse(localStorage.getItem(THEME_KEY)) || "auto"; } catch { return "auto"; } };
  function apply(t) {
    if (t !== "light" && t !== "dark") t = "auto";
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    for (const b of buttons) {
      const on = b.dataset.choice === t;
      b.setAttribute("aria-checked", on);
      b.tabIndex = on ? 0 : -1; // radiogroup: one tab stop, arrows move between options
    }
  }
  function choose(t, focus) {
    try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch {}
    apply(t);
    if (focus) buttons.find((b) => b.dataset.choice === t)?.focus();
  }
  sw.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) choose(b.dataset.choice);
  });
  sw.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = buttons.findIndex((b) => b.getAttribute("aria-checked") === "true");
    choose(buttons[(i + step + buttons.length) % buttons.length].dataset.choice, true);
  });
  apply(read());

  row.append(loaded, " · ", btn, sw);

  // The home-screen icon, so the footer signs off the page.
  const mark = document.createElement("img");
  mark.className = "foot-mark";
  mark.src = "icons/icon.svg";
  mark.alt = "";
  mark.width = mark.height = 28;

  // For anyone who wants the code: muted, so it doesn't compete with the page links.
  const code = document.createElement("a");
  code.className = "foot-code";
  code.href = "https://github.com/quepol/next-big-thing";
  code.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>Code on GitHub';

  foot.replaceChildren(mark, nav, row, code);

  // Reopening the app after an hour or more reloads it on its own.
  const refreshIfStale = () => { if (Date.now() - loadedAt > STALE_MS) refresh(); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshIfStale(); });
  window.addEventListener("pageshow", (e) => { if (e.persisted) refreshIfStale(); });
  if (location.search.includes("r=")) history.replaceState(null, "", location.pathname + location.hash);
})();
