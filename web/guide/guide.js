// The phone menu and the search. The pages work without it.
(() => {
  const menu = document.getElementById("menu"), nav = document.getElementById("contents");
  menu.addEventListener("click", () => menu.setAttribute("aria-expanded", String(nav.classList.toggle("open"))));

  const q = document.getElementById("q"), hits = document.getElementById("hits");
  const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
  const show = () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    hits.replaceChildren();
    hits.hidden = !words.length;
    if (!words.length) return;
    const found = (window.GUIDE || [])
      .map((e) => {
        const head = `${e.p} ${e.h}`.toLowerCase(), all = `${head} ${e.t.toLowerCase()}`;
        return words.every((w) => all.includes(w)) ? { e, rank: words.filter((w) => head.includes(w)).length } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8);
    if (!found.length) { hits.append(el("p", "Nothing found.")); return; }
    for (const { e } of found) {
      const a = el("a", e.h ? `${e.p} › ${e.h}` : e.p);
      a.href = e.u;
      const at = Math.max(0, e.t.toLowerCase().indexOf(words[0]) - 30);
      a.append(el("small", `${at ? "…" : ""}${e.t.slice(at, at + 90)}…`));
      a.addEventListener("click", () => { hits.hidden = true; });
      hits.append(a);
    }
  };
  q.addEventListener("input", show);
  q.addEventListener("focus", show);
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) hits.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hits.hidden = true; nav.classList.remove("open"); } });
})();
