"use strict";

const TabSources = {
  order(tabs, preferredId, windowId) {
    return tabs.filter(tab => Number.isInteger(tab.id) && /^https?:\/\//.test(tab.url || ""))
      .sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId)
        || Number(b.windowId === windowId) - Number(a.windowId === windowId)
        || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  },
  async list(preferredId) {
    const [tabs, current] = await Promise.all([browser.tabs.query({}), browser.tabs.getCurrent()]);
    return TabSources.order(tabs, preferredId, current?.windowId);
  },
};
if (typeof module !== "undefined") module.exports = { TabSources };
