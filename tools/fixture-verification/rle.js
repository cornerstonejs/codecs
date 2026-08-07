// From-scratch DICOM RLE (PS3.5 Annex G) decoder. 16-bit single sample:
// segment 0 carries the high bytes, segment 1 the low bytes.
"use strict";

function unpackSegment(buf, start, end, expected) {
  const out = Buffer.alloc(expected);
  let i = start;
  let o = 0;
  while (i < end && o < expected) {
    const n = buf.readInt8(i);
    i += 1;
    if (n >= 0) {
      // literal run: copy n+1 bytes
      buf.copy(out, o, i, i + n + 1);
      i += n + 1;
      o += n + 1;
    } else if (n >= -127) {
      // replicate run: next byte repeated -n+1 times
      out.fill(buf[i], o, o + (-n + 1));
      i += 1;
      o += -n + 1;
    }
    // n === -128: no-op
  }
  if (o !== expected) throw new Error(`segment underflow: ${o} of ${expected}`);
  return out;
}

function decodeRLE16(buf, width, height) {
  const numSegments = buf.readUInt32LE(0);
  if (numSegments !== 2) throw new Error(`expected 2 segments, got ${numSegments}`);
  const off0 = buf.readUInt32LE(4);
  const off1 = buf.readUInt32LE(8);
  const frameSize = width * height;
  const hi = unpackSegment(buf, off0, off1, frameSize);
  const lo = unpackSegment(buf, off1, buf.length, frameSize);
  const out = Buffer.alloc(frameSize * 2);
  for (let i = 0; i < frameSize; i++) {
    out.writeUInt16LE((hi[i] << 8) | lo[i], i * 2);
  }
  return out;
}

module.exports = { decodeRLE16 };
