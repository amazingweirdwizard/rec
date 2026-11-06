// A full tab keeps the recorder alive when the toolbar panel loses focus.
browser.action.onClicked.addListener(async (sourceTab) => {
  const url = browser.runtime.getURL("recorder.html");
  const tabs = await browser.tabs.query({});
  const existing = tabs.find((tab) => tab.url?.split("?")[0] === url);
  if (existing) {
    if (sourceTab.url?.startsWith("http")) {
      await browser.runtime.sendMessage({ type: "screen-target", tabId: sourceTab.id }).catch(() => {});
    }
    await browser.tabs.update(existing.id, { active: true, autoDiscardable: false });
    await browser.windows.update(existing.windowId, { focused: true });
  } else {
    const target = sourceTab.url?.startsWith("http") ? `?target=${sourceTab.id}` : "";
    const tab = await browser.tabs.create({ url: url + target });
    await browser.tabs.update(tab.id, { autoDiscardable: false });
  }
});
