const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TabSources } = require('../tab-sources.js');

test('preferred Firefox tab comes first, followed by current window and recent tabs', () => {
  const tabs = [
    { id: 1, url: 'https://one.example', windowId: 1, lastAccessed: 10 },
    { id: 2, url: 'https://two.example', windowId: 2, lastAccessed: 100 },
    { id: 3, url: 'https://three.example', windowId: 1, lastAccessed: 20 },
    { id: 4, url: 'https://four.example', windowId: 3, lastAccessed: 500 },
  ];
  assert.deepEqual(TabSources.order(tabs, 2, 1).map(t => t.id), [2, 3, 1, 4]);
  assert.deepEqual(tabs.map(t => t.id), [1, 2, 3, 4]);
});

test('tab selector omits internal pages, extension pages and missing URLs', () => {
  const tabs = [
    { id: 1, url: 'about:debugging' }, { id: 2, url: 'moz-extension://id/recorder.html' },
    { id: 3 }, { id: 4, url: 'file:///test.html' }, { id: 5, url: 'https://example.org' },
    { id: 6, url: 'http://localhost:8080' },
  ];
  assert.deepEqual(TabSources.order(tabs, 1, 1).map(t => t.id), [5, 6]);
});
