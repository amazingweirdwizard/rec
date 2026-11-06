(() => {
  globalThis.__screenPickerCancel?.();
  return new Promise((resolve) => {
    let selected = null;
    const host = document.createElement("div");
    host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important";
    const shadow = host.attachShadow({ mode: "closed" });
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;box-sizing:border-box;border:3px solid #16b882;background:#16b88222;pointer-events:none";
    const label = document.createElement("div");
    label.style.cssText = "position:fixed;top:12px;left:12px;max-width:90vw;padding:12px 16px;border-radius:8px;background:#173b2b;color:white;font:14px system-ui;pointer-events:none";
    label.textContent = "Screen · Survolez un élément, puis cliquez · ↑ : parent · Échap : annuler";
    shadow.append(box, label);
    document.documentElement.append(host);
    function highlight(element) {
      if (!(element instanceof Element) || element === host) return;
      selected = element;
      const r = element.getBoundingClientRect();
      Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
      label.textContent = `Screen · ${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""} · ${Math.round(r.width)} × ${Math.round(r.height)} · Clic : sélectionner · ↑ : parent · Échap : annuler`;
    }
    function move(event) { highlight(event.composedPath()[0]); }
    function finish(value) {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerdown", block, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("pagehide", cancel);
      host.remove();
      delete globalThis.__screenPickerCancel;
      resolve(value);
    }
    function block(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    function click(event) {
      block(event);
      if (!selected || !selected.isConnected) return;
      const r = selected.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      globalThis.__screenSelectedElement = selected;
      finish({ label: `${selected.tagName.toLowerCase()}${selected.id ? `#${selected.id}` : ""}`, width: r.width, height: r.height });
    }
    function key(event) {
      if (event.key === "Escape") { block(event); finish(null); }
      else if (event.key === "ArrowUp" && selected?.parentElement) { block(event); highlight(selected.parentElement); }
    }
    function cancel() { finish(null); }
    globalThis.__screenPickerCancel = cancel;
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerdown", block, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("pagehide", cancel, { once: true });
  });
})();
