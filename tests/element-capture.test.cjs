const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { ElementCapture } = require('../element-capture.js');

test('element rectangle uses document coordinates and rounds outwards', () => {
  assert.deepEqual(ElementCapture.normalizeRectangle({ x: 10.2, y: 300.8, width: 200.1, height: 100.3 }),
    { x: 10, y: 300, width: 201, height: 102 });
  assert.deepEqual(ElementCapture.normalizeRectangle({ x: -10, y: -5, width: 100, height: 100 }),
    { x: 0, y: 0, width: 90, height: 95 });
});

test('rejects removed, hidden, invalid or oversized elements', () => {
  for (const rect of [null, { x: 0, y: 0, width: 0, height: 30 },
    { x: NaN, y: 0, width: 50, height: 50 }, { x: 0, y: 0, width: 4000, height: 100 }]) {
    assert.throws(() => ElementCapture.normalizeRectangle(rect));
  }
});

function setup() {
  const timers = new Map();
  let id = 0;
  const calls = [];
  const listeners = () => ({
    values: new Set(), addListener(fn) { this.values.add(fn); },
    removeListener(fn) { this.values.delete(fn); },
    emit(...args) { [...this.values].forEach(fn => fn(...args)); },
  });
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  const canvas = {
    getContext() { return { fillRect() {}, drawImage(...args) { calls.push(['draw', ...args.slice(1)]); } }; },
    captureStream(rate) { calls.push(['stream', rate]); return { getTracks: () => [track] }; },
  };
  const tabs = { onUpdated: listeners(), onRemoved: listeners(),
    async captureTab(tabId, options) { calls.push(['capture', tabId, options.rect.x]); return 'data:image/png;base64,AA=='; },
  };
  let rectangle = { x: 10, y: 20, width: 101, height: 51 };
  const errors = [];
  const context = {
    module: { exports: {} }, document: { createElement: () => canvas },
    browser: { tabs, scripting: { async executeScript() { return [{ result: rectangle }]; } } },
    Image: class { constructor() { this.naturalWidth = 101; this.naturalHeight = 51; } async decode() {} },
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(timer) { timers.delete(timer); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../element-capture.js'), 'utf8'), context);
  return { api: context.module.exports.ElementCapture, calls, canvas, track, tabs, errors,
    move() { rectangle = { ...rectangle, x: 50 }; },
    remove() { rectangle = null; },
    async tick() { const callbacks = [...timers.values()]; timers.clear(); for (const fn of callbacks) await fn(); },
    pending: () => timers.size,
  };
}

test('HTML capture follows element movement, fixes output size and cleans up when stopped', async () => {
  const app = setup();
  const session = await app.api.createStream({ tabId: 12 }, e => app.errors.push(e));
  assert.equal(app.canvas.width, 102);
  assert.equal(app.canvas.height, 52);
  assert.equal(app.calls[0][0], 'capture');
  app.move();
  await app.tick();
  assert.equal(app.calls.filter(c => c[0] === 'capture').at(-1)[2], 50);
  session.close();
  await app.tick();
  assert.equal(app.track.readyState, 'ended');
  assert.equal(app.pending(), 0);
  assert.equal(app.tabs.onUpdated.values.size, 0);
  assert.equal(app.errors.length, 0);
});

test('removing the element stops the source and reports an error once', async () => {
  const app = setup();
  await app.api.createStream({ tabId: 12 }, e => app.errors.push(e));
  app.remove();
  await app.tick();
  assert.equal(app.track.readyState, 'ended');
  assert.equal(app.errors.length, 1);
  assert.equal(app.pending(), 0);
});

test('navigating the source tab stops capture before recording another page', async () => {
  const app = setup();
  await app.api.createStream({ tabId: 12 }, e => app.errors.push(e));
  app.tabs.onUpdated.emit(12, { status: 'loading' });
  assert.equal(app.track.readyState, 'ended');
  assert.equal(app.errors.length, 1);
  assert.equal(app.pending(), 0);
  assert.equal(app.tabs.onRemoved.values.size, 0);
});
