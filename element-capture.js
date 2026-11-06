"use strict";

const ElementCapture = {
  async pick(tabId) {
    if (!Number.isInteger(tabId)) throw new Error("ELEMENT_NO_TAB");
    const recorderTab = await browser.tabs.getCurrent();
    const tab = await browser.tabs.get(tabId);
    if (!/^https?:/.test(tab.url || "")) throw new Error("ELEMENT_RESTRICTED");
    await browser.windows.update(tab.windowId, { focused: true });
    await browser.tabs.update(tabId, { active: true });
    try {
      const results = await browser.scripting.executeScript({ target: { tabId }, files: ["element-picker.js"] });
      const selection = results[0]?.result;
      return selection ? { ...selection, tabId } : null;
    } finally {
      if (recorderTab) {
        await browser.tabs.update(recorderTab.id, { active: true }).catch(() => {});
        await browser.windows.update(recorderTab.windowId, { focused: true }).catch(() => {});
      }
    }
  },

  async rectangle(tabId, fullTab = false) {
    const results = await browser.scripting.executeScript({ target: { tabId }, args: [fullTab], func: (captureFullTab) => {
      if (captureFullTab) return { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight };
      const element = globalThis.__screenSelectedElement;
      if (!element?.isConnected) return null;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return null;
      const r = element.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
    } });
    return ElementCapture.normalizeRectangle(results[0]?.result);
  },

  normalizeRectangle(rect) {
    if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) throw new Error("ELEMENT_GONE");
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const width = Math.ceil(rect.x + rect.width) - x;
    const height = Math.ceil(rect.y + rect.height) - y;
    if (width < 2 || height < 2) throw new Error("ELEMENT_GONE");
    if (width > 3840 || height > 2160) throw new Error("ELEMENT_TOO_LARGE");
    return { x, y, width, height };
  },

  async createStream(selection, onError) {
    const canvas = document.createElement("canvas");
    const rect = await ElementCapture.rectangle(selection.tabId, selection.fullTab);
    // Even dimensions improve compatibility with VP8 encoders.
    canvas.width = Math.ceil(rect.width / 2) * 2;
    canvas.height = Math.ceil(rect.height / 2) * 2;
    const context = canvas.getContext("2d", { alpha: false });
    let closed = false;
    let timer = null;
    let stream = null;
    const close = () => {
      closed = true;
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      stream?.getTracks().forEach(track => track.stop());
    };
    function changed() {
      if (closed) return;
      close();
      onError(new Error("ELEMENT_GONE"));
    }
    function onUpdated(tabId, change) {
      if (tabId === selection.tabId && change.status === "loading") changed();
    }
    function onRemoved(tabId) { if (tabId === selection.tabId) changed(); }
    async function draw(area) {
      const dataUrl = await browser.tabs.captureTab(selection.tabId, { format: "png", rect: area, scale: 1 });
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      if (closed) return;
      context.fillStyle = "#14221b";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }
    await draw(rect);
    stream = canvas.captureStream(5);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
    async function frame() {
      if (closed) return;
      try {
        await draw(await ElementCapture.rectangle(selection.tabId, selection.fullTab));
      } catch (error) {
        if (!closed) { close(); onError(error); }
        return;
      }
      if (!closed) timer = setTimeout(frame, 200);
    }
    timer = setTimeout(frame, 200);
    return { stream, close };
  },
};

if (typeof module !== "undefined") module.exports = { ElementCapture };
