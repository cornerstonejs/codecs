// From-scratch sequential DCT JPEG decoder (T.81): baseline 8-bit (SOF0)
// and extended sequential 12-bit (SOF1), single component, restart
// intervals supported. The IDCT is the classic Loeffler-Ligtenberg-Moshovitz
// integer algorithm with libjpeg's "islow" fixed-point constants and
// descaling, so output should be bit-identical to libjpeg's C islow path.
"use strict";

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

const CONST_BITS = 13;
// libjpeg jidctint.c: PASS1_BITS is 2 for 8-bit samples, 1 for 9..12-bit
// (keeps intermediates inside 32 bits in the C implementation)
const FIX_0_298631336 = 2446;
const FIX_0_390180644 = 3196;
const FIX_0_541196100 = 4433;
const FIX_0_765366865 = 6270;
const FIX_0_899976223 = 7373;
const FIX_1_175875602 = 9633;
const FIX_1_501321110 = 12299;
const FIX_1_847759065 = 15137;
const FIX_1_961570560 = 16069;
const FIX_2_053119869 = 16819;
const FIX_2_562915447 = 20995;
const FIX_3_072711026 = 25172;

const DESCALE = (x, n) => Math.floor((x + (1 << (n - 1))) / (1 << n));

// 8x8 islow IDCT: coef (natural order, already dequantized) -> samples
function idctIslow(coef, out, center, maxval, PASS1_BITS) {
  const ws = new Array(64);
  // pass 1: columns
  for (let c = 0; c < 8; c++) {
    if (
      coef[c + 8] === 0 && coef[c + 16] === 0 && coef[c + 24] === 0 &&
      coef[c + 32] === 0 && coef[c + 40] === 0 && coef[c + 48] === 0 &&
      coef[c + 56] === 0
    ) {
      const dc = coef[c] * (1 << PASS1_BITS);
      for (let r = 0; r < 8; r++) ws[c + 8 * r] = dc;
      continue;
    }
    let z2 = coef[c + 16];
    let z3 = coef[c + 48];
    let z1 = (z2 + z3) * FIX_0_541196100;
    let tmp2 = z1 + z3 * -FIX_1_847759065;
    let tmp3 = z1 + z2 * FIX_0_765366865;
    z2 = coef[c];
    z3 = coef[c + 32];
    let tmp0 = (z2 + z3) * (1 << CONST_BITS);
    let tmp1 = (z2 - z3) * (1 << CONST_BITS);
    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;
    tmp0 = coef[c + 56];
    tmp1 = coef[c + 40];
    tmp2 = coef[c + 24];
    tmp3 = coef[c + 8];
    z1 = tmp0 + tmp3;
    z2 = tmp1 + tmp2;
    z3 = tmp0 + tmp2;
    let z4 = tmp1 + tmp3;
    const z5 = (z3 + z4) * FIX_1_175875602;
    tmp0 *= FIX_0_298631336;
    tmp1 *= FIX_2_053119869;
    tmp2 *= FIX_3_072711026;
    tmp3 *= FIX_1_501321110;
    z1 *= -FIX_0_899976223;
    z2 *= -FIX_2_562915447;
    z3 = z3 * -FIX_1_961570560 + z5;
    z4 = z4 * -FIX_0_390180644 + z5;
    tmp0 += z1 + z3;
    tmp1 += z2 + z4;
    tmp2 += z2 + z3;
    tmp3 += z1 + z4;
    ws[c] = DESCALE(tmp10 + tmp3, CONST_BITS - PASS1_BITS);
    ws[c + 56] = DESCALE(tmp10 - tmp3, CONST_BITS - PASS1_BITS);
    ws[c + 8] = DESCALE(tmp11 + tmp2, CONST_BITS - PASS1_BITS);
    ws[c + 48] = DESCALE(tmp11 - tmp2, CONST_BITS - PASS1_BITS);
    ws[c + 16] = DESCALE(tmp12 + tmp1, CONST_BITS - PASS1_BITS);
    ws[c + 40] = DESCALE(tmp12 - tmp1, CONST_BITS - PASS1_BITS);
    ws[c + 24] = DESCALE(tmp13 + tmp0, CONST_BITS - PASS1_BITS);
    ws[c + 32] = DESCALE(tmp13 - tmp0, CONST_BITS - PASS1_BITS);
  }
  // pass 2: rows
  const clamp = (v) => {
    v += center;
    return v < 0 ? 0 : v > maxval ? maxval : v;
  };
  for (let r = 0; r < 8; r++) {
    const o = 8 * r;
    if (
      ws[o + 1] === 0 && ws[o + 2] === 0 && ws[o + 3] === 0 && ws[o + 4] === 0 &&
      ws[o + 5] === 0 && ws[o + 6] === 0 && ws[o + 7] === 0
    ) {
      const dc = clamp(DESCALE(ws[o], PASS1_BITS + 3));
      for (let c = 0; c < 8; c++) out[o + c] = dc;
      continue;
    }
    let z2 = ws[o + 2];
    let z3 = ws[o + 6];
    let z1 = (z2 + z3) * FIX_0_541196100;
    let tmp2 = z1 + z3 * -FIX_1_847759065;
    let tmp3 = z1 + z2 * FIX_0_765366865;
    let tmp0 = (ws[o] + ws[o + 4]) * (1 << CONST_BITS);
    let tmp1 = (ws[o] - ws[o + 4]) * (1 << CONST_BITS);
    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;
    tmp0 = ws[o + 7];
    tmp1 = ws[o + 5];
    tmp2 = ws[o + 3];
    tmp3 = ws[o + 1];
    z1 = tmp0 + tmp3;
    z2 = tmp1 + tmp2;
    z3 = tmp0 + tmp2;
    let z4 = tmp1 + tmp3;
    const z5 = (z3 + z4) * FIX_1_175875602;
    tmp0 *= FIX_0_298631336;
    tmp1 *= FIX_2_053119869;
    tmp2 *= FIX_3_072711026;
    tmp3 *= FIX_1_501321110;
    z1 *= -FIX_0_899976223;
    z2 *= -FIX_2_562915447;
    z3 = z3 * -FIX_1_961570560 + z5;
    z4 = z4 * -FIX_0_390180644 + z5;
    tmp0 += z1 + z3;
    tmp1 += z2 + z4;
    tmp2 += z2 + z3;
    tmp3 += z1 + z4;
    out[o] = clamp(DESCALE(tmp10 + tmp3, CONST_BITS + PASS1_BITS + 3));
    out[o + 7] = clamp(DESCALE(tmp10 - tmp3, CONST_BITS + PASS1_BITS + 3));
    out[o + 1] = clamp(DESCALE(tmp11 + tmp2, CONST_BITS + PASS1_BITS + 3));
    out[o + 6] = clamp(DESCALE(tmp11 - tmp2, CONST_BITS + PASS1_BITS + 3));
    out[o + 2] = clamp(DESCALE(tmp12 + tmp1, CONST_BITS + PASS1_BITS + 3));
    out[o + 5] = clamp(DESCALE(tmp12 - tmp1, CONST_BITS + PASS1_BITS + 3));
    out[o + 3] = clamp(DESCALE(tmp13 + tmp0, CONST_BITS + PASS1_BITS + 3));
    out[o + 4] = clamp(DESCALE(tmp13 - tmp0, CONST_BITS + PASS1_BITS + 3));
  }
}

function buildHuffman(counts, symbols) {
  const lut = new Map();
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < counts[len - 1]; i++) lut.set(`${len}:${code++}`, symbols[k++]);
    code <<= 1;
  }
  return lut;
}

class BitReader {
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
        if (this.buf[this.pos] === 0x00) this.pos++;
        else throw new Error(`marker FF${this.buf[this.pos].toString(16)} in entropy data`);
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
  alignAndConsumeRestart(expected) {
    this.bitCount = 0;
    if (this.buf[this.pos] !== 0xff) throw new Error("expected restart marker");
    const m = this.buf[this.pos + 1];
    if (m !== 0xd0 + expected) throw new Error(`expected RST${expected}, got FF${m.toString(16)}`);
    this.pos += 2;
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

const extend = (v, t) => (v < 1 << (t - 1) ? v - (1 << t) + 1 : v);

function decodeSequentialDCT(buf) {
  let i = 2;
  let P, Y, X;
  let qt = null;
  const huffDC = {};
  const huffAC = {};
  let restartInterval = 0;
  for (;;) {
    if (buf[i] !== 0xff) throw new Error(`expected marker at ${i}`);
    const m = buf[i + 1];
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (m === 0xdb) {
      // DQT (single table, 8-bit precision Pq=0 assumed for these fixtures)
      const pq = buf[i + 4] >> 4;
      qt = new Int32Array(64);
      for (let k = 0; k < 64; k++) {
        qt[ZIGZAG[k]] = pq ? (buf[i + 5 + 2 * k] << 8) | buf[i + 6 + 2 * k] : buf[i + 5 + k];
      }
    } else if (m === 0xc0 || m === 0xc1) {
      P = buf[i + 4];
      Y = (buf[i + 5] << 8) | buf[i + 6];
      X = (buf[i + 7] << 8) | buf[i + 8];
      if (buf[i + 9] !== 1) throw new Error("only single-component supported");
      if (buf[i + 11] !== 0x11) throw new Error("only 1x1 sampling supported");
    } else if (m === 0xc4) {
      // DHT: may contain multiple tables in one segment
      let p = i + 4;
      const end = i + 2 + len;
      while (p < end) {
        const tcth = buf[p];
        const counts = Array.from(buf.slice(p + 1, p + 17));
        const total = counts.reduce((a, b) => a + b, 0);
        const symbols = Array.from(buf.slice(p + 17, p + 17 + total));
        const lut = buildHuffman(counts, symbols);
        if (tcth >> 4 === 0) huffDC[tcth & 15] = lut;
        else huffAC[tcth & 15] = lut;
        p += 17 + total;
      }
    } else if (m === 0xdd) {
      restartInterval = (buf[i + 4] << 8) | buf[i + 5];
    } else if (m === 0xda) {
      const Ns = buf[i + 4];
      if (Ns !== 1) throw new Error("only single-scan supported");
      var dcSel = buf[i + 6] >> 4;
      var acSel = buf[i + 6] & 15;
      i = i + 2 + len;
      break;
    }
    i += 2 + len;
  }

  const reader = new BitReader(buf, i);
  const dcTab = huffDC[dcSel];
  const acTab = huffAC[acSel];
  const maxval = (1 << P) - 1;
  const center = 1 << (P - 1);

  const blocksX = Math.ceil(X / 8);
  const blocksY = Math.ceil(Y / 8);
  const out = P > 8 ? new Uint16Array(X * Y) : new Uint8Array(X * Y);

  let dcPred = 0;
  let mcu = 0;
  let restartCount = 0;
  const coef = new Int32Array(64);
  const px = new Array(64);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      if (restartInterval && mcu > 0 && mcu % restartInterval === 0) {
        reader.alignAndConsumeRestart(restartCount & 7);
        restartCount++;
        dcPred = 0;
      }
      mcu++;

      coef.fill(0);
      const t = decodeHuff(reader, dcTab);
      const diff = t === 0 ? 0 : extend(reader.readBits(t), t);
      dcPred += diff;
      coef[0] = dcPred * qt[0];
      let k = 1;
      while (k < 64) {
        const rs = decodeHuff(reader, acTab);
        const r = rs >> 4;
        const s = rs & 15;
        if (s === 0) {
          if (r === 15) {
            k += 16;
            continue;
          }
          break; // EOB
        }
        k += r;
        coef[ZIGZAG[k]] = extend(reader.readBits(s), s) * qt[ZIGZAG[k]];
        k++;
      }

      idctIslow(coef, px, center, maxval, P > 8 ? 1 : 2);
      const w = Math.min(8, X - bx * 8);
      const h = Math.min(8, Y - by * 8);
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          out[(by * 8 + yy) * X + bx * 8 + xx] = px[yy * 8 + xx];
        }
      }
    }
  }

  let bytes;
  if (P > 8) {
    bytes = Buffer.alloc(out.length * 2);
    for (let k2 = 0; k2 < out.length; k2++) bytes.writeUInt16LE(out[k2], k2 * 2);
  } else {
    bytes = Buffer.from(out);
  }
  return { bytes, P, X, Y, restartInterval };
}

module.exports = { decodeSequentialDCT };
