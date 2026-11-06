"use strict";

// Firefox writes a Duration placeholder in Segment/Info. Patch only that float:
// byte offsets, SeekHead, clusters and encoded audio/video remain unchanged.
async function finalizeWebmDuration(blob, milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return blob;
  const bytes = new Uint8Array(await blob.slice(0, 1024 * 1024).arrayBuffer());
  function element(offset, limit) {
    function vint(position, keepMarker) {
      const first = bytes[position];
      if (!first) throw new Error("En-tête WebM invalide");
      let width = 1;
      let marker = 128;
      while (!(first & marker) && width < 8) { width++; marker >>= 1; }
      if (position + width > limit) throw new Error("En-tête WebM tronqué");
      let value = keepMarker ? first : first & (marker - 1);
      let unknown = !keepMarker && value === marker - 1;
      for (let i = 1; i < width; i++) {
        value = value * 256 + bytes[position + i];
        unknown = unknown && bytes[position + i] === 255;
      }
      return { width, value, unknown };
    }
    const id = vint(offset, true);
    const size = vint(offset + id.width, false);
    const start = offset + id.width + size.width;
    return { id: id.value, start, end: size.unknown ? limit : start + size.value };
  }
  function find(id, start, end) {
    for (let offset = start; offset < end;) {
      const entry = element(offset, end);
      if (entry.id === id) return entry;
      if (entry.end <= offset || entry.end > end) break;
      offset = entry.end;
    }
    return null;
  }
  const segment = find(0x18538067, 0, bytes.length);
  const info = segment && find(0x1549a966, segment.start, Math.min(segment.end, bytes.length));
  if (!info || info.end > bytes.length) throw new Error("Métadonnées WebM introuvables");
  const duration = find(0x4489, info.start, info.end);
  const scale = find(0x2ad7b1, info.start, info.end);
  let nanosecondsPerTick = 1000000;
  if (scale) {
    nanosecondsPerTick = 0;
    for (let i = scale.start; i < scale.end; i++) nanosecondsPerTick = nanosecondsPerTick * 256 + bytes[i];
  }
  if (!duration || ![4, 8].includes(duration.end - duration.start) || nanosecondsPerTick <= 0) {
    throw new Error("Champ de durée WebM indisponible");
  }
  const length = duration.end - duration.start;
  const view = new DataView(bytes.buffer, duration.start, length);
  const existing = length === 8 ? view.getFloat64(0) : view.getFloat32(0);
  if (Number.isFinite(existing) && existing > 0) return blob;
  const replacement = new Uint8Array(length);
  const patched = new DataView(replacement.buffer);
  const ticks = milliseconds * 1000000 / nanosecondsPerTick;
  if (length === 8) patched.setFloat64(0, ticks);
  else patched.setFloat32(0, ticks);
  return new Blob([blob.slice(0, duration.start), replacement, blob.slice(duration.end)], { type: blob.type });
}

if (typeof module !== "undefined") module.exports = { finalizeWebmDuration };
