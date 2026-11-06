const { test } = require('node:test');
const assert = require('node:assert/strict');
const { finalizeWebmDuration } = require('../webm-duration.js');

function element(hexId, payload) {
  return Buffer.concat([Buffer.from(hexId, 'hex'), Buffer.from([128 | payload.length]), payload]);
}
function fixture({ initial = 0, width = 8, scale = 1000000, missing = false } = {}) {
  const scaleBytes = Buffer.alloc(4);
  scaleBytes.writeUInt32BE(scale);
  const float = Buffer.alloc(width);
  if (width === 8) float.writeDoubleBE(initial);
  else float.writeFloatBE(initial);
  const info = element('1549a966', Buffer.concat([
    element('2ad7b1', scaleBytes),
    ...(missing ? [] : [element('4489', float)]),
  ]));
  return new Blob([
    element('1a45dfa3', Buffer.alloc(0)),
    Buffer.from('1853806701ffffffffffffff', 'hex'),
    element('114d9b74', Buffer.alloc(0)), info,
    element('1f43b675', Buffer.from([0xe7, 0x81, 0, 0xa3, 0x83, 1, 2, 3])),
  ], { type: 'video/webm' });
}

test('11-second Firefox recording gets a duration without moving any encoded data', async () => {
  const original = fixture();
  const fixed = await finalizeWebmDuration(original, 11000);
  const before = Buffer.from(await original.arrayBuffer());
  const after = Buffer.from(await fixed.arrayBuffer());
  const offset = after.indexOf(Buffer.from('448988', 'hex')) + 3;
  assert.equal(after.readDoubleBE(offset), 11000);
  assert.equal(fixed.type, original.type);
  assert.equal(fixed.size, original.size);
  assert.deepEqual(before.subarray(0, offset), after.subarray(0, offset));
  assert.deepEqual(before.subarray(offset + 8), after.subarray(offset + 8));
});

test('supports 32-bit duration and non-default timestamp scale', async () => {
  const fixed = await finalizeWebmDuration(fixture({ width: 4, scale: 2000000 }), 11000);
  const bytes = Buffer.from(await fixed.arrayBuffer());
  assert.equal(bytes.readFloatBE(bytes.indexOf(Buffer.from('448984', 'hex')) + 3), 5500);
});

test('preserves a duration already written by the encoder', async () => {
  const original = fixture({ initial: 12345 });
  assert.equal(await finalizeWebmDuration(original, 11000), original);
});

test('rejects missing or malformed metadata instead of corrupting the file', async () => {
  await assert.rejects(finalizeWebmDuration(fixture({ missing: true }), 11000));
  await assert.rejects(finalizeWebmDuration(new Blob([new Uint8Array([0])]), 11000));
  await assert.rejects(finalizeWebmDuration(new Blob([new Uint8Array([0x1a])]), 11000));
});
