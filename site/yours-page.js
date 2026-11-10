// The Yours page: the bands you follow and hide, the rooms you follow, and this device's key.
// All the data handling is in yours.js; this only draws it.

(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const titleCase = (s) => s.replace(/(^|\s)\w/g, (c) => c.toUpperCase()); // "lee's palace" -> "Lee's Palace"
  const STATUS = {
    synced: "Saved to GitHub. Every device sees these lists.",
    saving: "Saving…",
    nokey: "Showing the saved lists. To change them from this device, add a GitHub key below.",
    error: "Couldn't reach GitHub. Changes are kept on this device and saved next time.",
    badkey: "GitHub didn't accept this device's key: it may have expired, or lack Contents: read and write for this repo. Changes are kept on this device until a new key is saved.",
    local: "Loading…",
  };

  function list(id, items, undoLabel, undo) {
    const ul = $(id);
    ul.replaceChildren();
    if (!items.length) return ul.append(el("li", "empty", "None yet."));
    for (const b of items) {
      const li = el("li");
      li.append(el("span", "yname", b.label));
      if (b.when) li.append(el("span", "ywhen", b.when));
      if (undo) {
        const btn = el("button", "linkish", undoLabel);
        btn.type = "button";
        btn.addEventListener("click", () => undo(b));
        li.append(btn);
      }
      ul.append(li);
    }
  }

  const since = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  function draw() {
    for (const which of ["follow", "hide"]) {
      const items = Yours.bands(which).map((b) => ({ label: b.artist, when: since(b.at), artist: b.artist }));
      $(`n-${which}`).textContent = items.length || "";
      list(which, items, which === "follow" ? "Unfollow" : "Unhide", (b) => Yours.setBand(b.artist, null));
    }
    list("rooms", Yours.rooms(DEFAULT_ROOMS).map((k) => ({ label: titleCase(k) })));
    $("status").textContent = STATUS[Yours.status] || "";
    $("keybox").open = !Yours.hasKey;
    $("forget").hidden = !Yours.hasKey;
  }

  $("savekey").addEventListener("click", () => {
    const v = $("key").value.trim();
    if (!v) return;
    $("key").value = "";
    Yours.setKey(v).then(draw);
  });
  $("forget").addEventListener("click", () => Yours.setKey("").then(draw));
  Yours.onChange(draw);
  draw();
  Yours.load();
})();
