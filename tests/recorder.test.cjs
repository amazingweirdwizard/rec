const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup({ rejectMicrophone = false, deferStop = false, htmlMode = false, tabMode = false } = {}) {
  const documentListeners = {};
  const clock = { now: 1000 };
  const timeouts = new Map();
  let timerId = 0;
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, disabled: false, checked: false, textContent: '',
      classList: { toggle() {} }, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      removeAttribute(name) { delete this[name]; }, play() { return Promise.resolve(); },
    });
    return elements.get(id);
  };
  const track = (kind) => ({
    kind, readyState: 'live', muted: false, listeners: {},
    getSettings() { return { displaySurface: 'monitor' }; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    stop() { this.readyState = 'ended'; },
  });
  const video = track('video');
  const audio = track('audio');
  class Stream {
    constructor(tracks) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  }
  let current;
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(stream, options) {
      current = this; this.stream = stream; this.mimeType = options.mimeType;
      this.state = 'inactive'; this.listeners = {};
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      if (deferStop) return;
      this.finish();
    }
    finish() {
      this.listeners.dataavailable({ data: new Blob(['recorded-video']) });
      this.listeners.stop();
    }
  }
  const context = {
    document: { getElementById: element, hidden: false,
      addEventListener(name, callback) { documentListeners[name] = callback; } },
    window: { MediaRecorder: Recorder, confirm: () => true, addEventListener() {} },
    navigator: { mediaDevices: {
      async getDisplayMedia() { return new Stream([video]); },
      async getUserMedia() {
        if (rejectMicrophone) throw Object.assign(new Error(), { name: 'NotAllowedError' });
        return new Stream([audio]);
      },
    } },
    MediaRecorder: Recorder, MediaStream: Stream, Blob, Date, performance: { now: () => clock.now },
    async finalizeWebmDuration(blob) { return blob; },
    URL: { createObjectURL: () => 'blob:local-test', revokeObjectURL() {} },
    setInterval: () => 1, clearInterval() {},
    setTimeout(callback) { timeouts.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timeouts.delete(id); },
  };
  let elementError;
  let pageSelection;
  if (htmlMode || tabMode) {
    element('mode').value = tabMode ? 'tab' : 'element';
    context.location = { search: '?target=12' };
    context.URLSearchParams = URLSearchParams;
    context.browser = {
      runtime: { onMessage: { addListener() {} } },
      permissions: { async request() { return true; } },
    };
    context.ElementCapture = {
      async pick(tabId) { return { tabId, label: 'div#demo', width: 300, height: 200 }; },
      async createStream(selection, onError) {
        pageSelection = selection;
        elementError = onError;
        return { stream: new Stream([video]), close() { video.stop(); } };
      },
    };
    context.navigator.mediaDevices.getDisplayMedia = () => { throw new Error('HTML mode must not share the desktop'); };
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../recorder.js'), 'utf8'), context);
  return { element, video, audio, current: () => current,
    pageSelection: () => pageSelection,
    failElement() { elementError(new Error('ELEMENT_GONE')); },
    hide() { context.document.hidden = true; documentListeners.visibilitychange(); },
    show() { context.document.hidden = false; documentListeners.visibilitychange(); },
    advance(ms) { clock.now += ms; },
    expireTimeout() { [...timeouts.values()].forEach(callback => callback()); },
    pendingTimeouts: () => timeouts.size };
}

test('screen capture produces a local download and releases the display', async () => {
  const app = setup();
  await app.element('start').listeners.click();
  assert.equal(app.current().state, 'recording');
  assert.equal(app.current().stream.getAudioTracks().length, 0);
  app.element('stop').listeners.click();
  await new Promise(setImmediate);
  assert.equal(app.video.readyState, 'ended');
  assert.equal(app.element('download').href, 'blob:local-test');
  assert.match(app.element('download').download, /\.webm$/);
  assert.equal(app.element('result').hidden, false);
  assert.equal(app.element('start').disabled, false);
});

test('microphone is included when selected', async () => {
  const app = setup();
  app.element('microphone').checked = true;
  await app.element('start').listeners.click();
  assert.equal(app.current().stream.getAudioTracks().length, 1);
  app.element('stop').listeners.click();
  assert.equal(app.audio.readyState, 'ended');
});

test('pause, resume and Firefox stop finalize the capture', async () => {
  const app = setup();
  await app.element('start').listeners.click();
  app.element('pause').listeners.click();
  assert.equal(app.current().state, 'paused');
  app.element('pause').listeners.click();
  assert.equal(app.current().state, 'recording');
  app.element('pause').listeners.click();
  app.video.listeners.ended();
  await new Promise(setImmediate);
  assert.equal(app.current().state, 'inactive');
  assert.equal(app.element('result').hidden, false);
});

test('microphone refusal stops screen sharing and allows another attempt', async () => {
  const app = setup({ rejectMicrophone: true });
  app.element('microphone').checked = true;
  await app.element('start').listeners.click();
  assert.equal(app.video.readyState, 'ended');
  assert.equal(app.element('start').disabled, false);
  assert.match(app.element('message').textContent, /refusé/);
  assert.equal(app.current(), undefined);
});

test('asynchronous stop closes devices immediately and waits for the final data', async () => {
  const app = setup({ deferStop: true });
  await app.element('start').listeners.click();
  app.element('stop').listeners.click();
  assert.equal(app.video.readyState, 'ended');
  assert.equal(app.element('start').disabled, true);
  app.current().finish();
  await new Promise(setImmediate);
  assert.equal(app.element('download').href, 'blob:local-test');
  assert.equal(app.element('start').disabled, false);
  assert.equal(app.pendingTimeouts(), 0);
});

test('stalled finalization recovers received data and ignores late events from the old session', async () => {
  const app = setup({ deferStop: true });
  await app.element('start').listeners.click();
  const oldRecorder = app.current();
  oldRecorder.listeners.dataavailable({ data: new Blob(['partial-webm']) });
  app.element('stop').listeners.click();
  app.expireTimeout();
  assert.equal(app.element('status').textContent, 'Récupération partielle');
  assert.match(app.element('message').textContent, /incomplet/);
  assert.equal(app.element('result').hidden, false);
  assert.equal(app.element('start').disabled, false);
  // A fresh live track represents the next screen selection.
  app.video.readyState = 'live';
  await app.element('start').listeners.click();
  oldRecorder.finish();
  assert.equal(app.current().state, 'recording');
  assert.equal(app.element('result').hidden, true);
  assert.equal(app.video.readyState, 'live');
});

test('stalled finalization with no data restores controls and reports an empty capture', async () => {
  const app = setup({ deferStop: true });
  await app.element('start').listeners.click();
  app.element('stop').listeners.click();
  app.expireTimeout();
  assert.equal(app.element('status').textContent, 'Aucune vidéo récupérée');
  assert.equal(app.element('start').disabled, false);
  assert.equal(app.element('result').hidden, true);
});

test('minimizing and restoring the recorder does not stop recording or lose elapsed time', async () => {
  const app = setup();
  await app.element('start').listeners.click();
  app.advance(3000);
  app.hide();
  app.advance(20000); // Simulate no UI timer callbacks while Firefox is minimized.
  app.show();
  assert.equal(app.current().state, 'recording');
  assert.equal(app.video.readyState, 'live');
  assert.equal(app.element('timer').textContent, '00:23');
  assert.equal(app.pendingTimeouts(), 0);
});

test('a temporarily muted capture source warns without finalizing and recovers on unmute', async () => {
  const app = setup();
  await app.element('start').listeners.click();
  app.video.muted = true;
  app.video.listeners.mute();
  assert.match(app.element('status').textContent, /indisponible/);
  assert.equal(app.current().state, 'recording');
  assert.equal(app.video.readyState, 'live');
  assert.equal(app.pendingTimeouts(), 0);
  app.video.muted = false;
  app.video.listeners.unmute();
  assert.equal(app.element('status').textContent, 'Enregistrement en cours');
});

test('visibility changes do not resume a recording paused by the user', async () => {
  const app = setup();
  await app.element('start').listeners.click();
  app.advance(2000);
  app.element('pause').listeners.click();
  app.hide();
  app.advance(10000);
  app.show();
  assert.equal(app.current().state, 'paused');
  assert.equal(app.element('timer').textContent, '00:02');
});

test('HTML mode requires selection and restores controls when none was chosen', async () => {
  const app = setup({ htmlMode: true });
  await app.element('start').listeners.click();
  assert.equal(app.current(), undefined);
  assert.equal(app.element('start').disabled, false);
  assert.match(app.element('message').textContent, /Choisissez un onglet/);
});

test('HTML selection records its stream with microphone without requesting desktop sharing', async () => {
  const app = setup({ htmlMode: true });
  await app.element('pickElement').listeners.click();
  assert.match(app.element('elementSelection').textContent, /div#demo/);
  app.element('microphone').checked = true;
  await app.element('start').listeners.click();
  assert.equal(app.current().state, 'recording');
  assert.equal(app.current().stream.getAudioTracks().length, 1);
  assert.match(app.element('captureSource').textContent, /HTML div#demo/);
  app.element('stop').listeners.click();
  await new Promise(setImmediate);
  assert.equal(app.element('result').hidden, false);
  assert.equal(app.video.readyState, 'ended');
});

test('HTML source errors finalize received video with a clear interruption warning', async () => {
  const app = setup({ htmlMode: true });
  await app.element('pickElement').listeners.click();
  await app.element('start').listeners.click();
  app.failElement();
  await new Promise(setImmediate);
  assert.equal(app.current().state, 'inactive');
  assert.equal(app.element('result').hidden, false);
  assert.match(app.element('message').textContent, /interrompue/);
});

test('Firefox tab mode records the whole selected page without an element or desktop sharing', async () => {
  const app = setup({ tabMode: true });
  await app.element('start').listeners.click();
  assert.equal(app.current().state, 'recording');
  assert.equal(app.pageSelection().tabId, 12);
  assert.equal(app.pageSelection().fullTab, true);
  assert.equal(app.element('tabSource').disabled, true);
  assert.match(app.element('captureSource').textContent, /onglet Firefox/);
  app.element('stop').listeners.click();
  await new Promise(setImmediate);
  assert.equal(app.element('tabSource').disabled, false);
  assert.equal(app.element('result').hidden, false);
});

test('changing the Firefox tab invalidates the previous HTML selection', async () => {
  const app = setup({ htmlMode: true });
  await app.element('pickElement').listeners.click();
  app.element('tabSource').value = '20';
  app.element('tabSource').listeners.change();
  await app.element('start').listeners.click();
  assert.equal(app.current(), undefined);
  assert.match(app.element('message').textContent, /Choisissez un onglet/);
});

