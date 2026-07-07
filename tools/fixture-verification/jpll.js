// From-scratch JPEG Lossless (ITU-T T.81 process 14, SOF3) decoder.
// Single component, no restart intervals, all 7 predictors supported.
"use strict";

function buildHuffman(counts, symbols) {
  // canonical Huffman: map (length, code) -> symbol
  const lut = new Map();
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < counts[len - 1]; i++) {
      lut.set(`${len}:${code}`, symbols[k++]);
      code++;
    }
    code <<= 1;
  }
  return lut;
}

class BitReader {
  // classic JPEG entropy reader: 0xFF 0x00 is an escaped literal 0xFF
  constructor(buf, pos) {
    this.buf = buf;
    this.pos = pos;
    this.bitBuf = 0;
    this.bitCount = 0;
  }
  readBit() {
    if (this.bitCount === 0) {
      let byte = this.buf[this.pos++];
      if (byte === 0xff) {
        const next = this.buf[this.pos];
        if (next === 0x00) this.pos++;
        else throw new Error(`unexpected marker FF${next.toString(16)} in entropy data`);
      }
      this.bitBuf = byte;
      this.bitCount = 8;
    }
    this.bitCount--;
    return (this.bitBuf >> this.bitCount) & 1;
  }
  readBits(n) {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | this.readBit();
    return v;
  }
}

function decodeHuff(reader, lut) {
  let code = 0;
  for (let len = 1; len <= 16; len++) {
    code = (code << 1) | reader.readBit();
    const sym = lut.get(`${len}:${code}`);
    if (sym !== undefined) return sym;
  }
  throw new Error("invalid Huffman code");
}

function extend(v, t) {
  // T.81 F.2.2.1 EXTEND
  return v < 1 << (t - 1) ? v - (1 << t) + 1 : v;
}

function decodeJPLL(buf) {
  let i = 2; // skip SOI
  let P, Y, X, predictor, pointTransform;
  let huff = null;
  for (;;) {
    if (buf[i] !== 0xff) throw new Error(`expected marker at ${i}`);
    const m = buf[i + 1];
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (m === 0xc3) {
      P = buf[i + 4];
      Y = (buf[i + 5] << 8) | buf[i + 6];
      X = (buf[i + 7] << 8) | buf[i + 8];
      if (buf[i + 9] !== 1) throw new Error("only single-component supported");
    } else if (m === 0xc4) {
      const counts = Array.from(buf.slice(i + 5, i + 21));
      const total = counts.reduce((a, b) => a + b, 0);
      const symbols = Array.from(buf.slice(i + 21, i + 21 + total));
      huff = buildHuffman(counts, symbols);
    } else if (m === 0xda) {
      const Ns = buf[i + 4];
      if (Ns !== 1) throw new Error("only single-scan supported");
      predictor = buf[i + 5 + 2 * Ns];
      pointTransform = buf[i + 7 + 2 * Ns] & 0x0f;
      i = i + 2 + len;
      break;
    } else if (m === 0xdd) {
      throw new Error("restart intervals not supported here");
    }
    i += 2 + len;
  }

  const reader = new BitReader(buf, i);
  const out = new Uint16Array(X * Y);
  const defaultPx = 1 << (P - 1 - pointTransform);

  for (let y = 0; y < Y; y++) {
    for (let x = 0; x < X; x++) {
      const t = decodeHuff(reader, huff);
      let diff;
      if (t === 0) diff = 0;
      else if (t === 16) diff = 32768;
      else diff = extend(reader.readBits(t), t);

      let Px;
      if (y === 0 && x === 0) Px = defaultPx;
      else if (y === 0) Px = out[x - 1];
      else if (x === 0) Px = out[(y - 1) * X];
      else {
        const Ra = out[y * X + x - 1];
        const Rb = out[(y - 1) * X + x];
        const Rc = out[(y - 1) * X + x - 1];
        switch (predictor) {
          case 1: Px = Ra; break;
          case 2: Px = Rb; break;
          case 3: Px = Rc; break;
          case 4: Px = Ra + Rb - Rc; break;
          case 5: Px = Ra + ((Rb - Rc) >> 1); break;
          case 6: Px = Rb + ((Ra - Rc) >> 1); break;
          case 7: Px = (Ra + Rb) >> 1; break;
          default: throw new Error(`bad predictor ${predictor}`);
        }
      }
      out[y * X + x] = (Px + diff) & 0xffff;
    }
  }

  const bytes = Buffer.alloc(out.length * 2);
  for (let k = 0; k < out.length; k++) bytes.writeUInt16LE(out[k], k * 2);
  return { bytes, predictor, P, X, Y };
}

module.exports = { decodeJPLL };
