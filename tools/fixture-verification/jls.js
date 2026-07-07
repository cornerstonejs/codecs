// From-scratch JPEG-LS (ITU-T T.87 / LOCO-I) decoder.
// Supports: single component (ILV=0), lossless (NEAR=0) and near-lossless
// (NEAR>0), LSE preset parameters, no restart markers.
"use strict";

const J = [
  0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
  4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];
const MIN_C = -128;
const MAX_C = 127;

class JlsBitReader {
  // T.87 bit-stuffing: after an 0xFF byte, the following byte contributes
  // only 7 bits (its MSB must be 0; MSB 1 would be a marker).
  constructor(buf, pos) {
    this.buf = buf;
    this.pos = pos;
    this.bitBuf = 0;
    this.bitCount = 0;
    this.prevWasFF = false;
  }
  _load() {
    const byte = this.buf[this.pos++];
    if (this.prevWasFF) {
      if (byte & 0x80) throw new Error("marker inside entropy data");
      this.bitBuf = (this.bitBuf << 7) | byte;
      this.bitCount += 7;
      this.prevWasFF = false;
    } else {
      this.bitBuf = (this.bitBuf << 8) | byte;
      this.bitCount += 8;
      this.prevWasFF = byte === 0xff;
    }
  }
  readBit() {
    if (this.bitCount === 0) this._load();
    this.bitCount--;
    return (this.bitBuf >>> this.bitCount) & 1;
  }
  readBits(n) {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 2 + this.readBit();
    return v;
  }
}

function decodeJLS(buf) {
  // ---- header ----
  let i = 2;
  let P, H, W;
  let MAXVAL = null, T1 = null, T2 = null, T3 = null, RESET = 64;
  let NEAR = 0;
  for (;;) {
    if (buf[i] !== 0xff) throw new Error(`expected marker at ${i}`);
    const m = buf[i + 1];
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (m === 0xf7) {
      P = buf[i + 4];
      H = (buf[i + 5] << 8) | buf[i + 6];
      W = (buf[i + 7] << 8) | buf[i + 8];
      if (buf[i + 9] !== 1) throw new Error("only single-component supported");
    } else if (m === 0xf8 && buf[i + 4] === 1) {
      MAXVAL = (buf[i + 5] << 8) | buf[i + 6];
      T1 = (buf[i + 7] << 8) | buf[i + 8];
      T2 = (buf[i + 9] << 8) | buf[i + 10];
      T3 = (buf[i + 11] << 8) | buf[i + 12];
      RESET = (buf[i + 13] << 8) | buf[i + 14];
    } else if (m === 0xda) {
      const Ns = buf[i + 4];
      if (Ns !== 1) throw new Error("only single-scan supported");
      NEAR = buf[i + 5 + 2 * Ns];
      const ILV = buf[i + 6 + 2 * Ns];
      if (ILV !== 0) throw new Error("only ILV=0 supported");
      i = i + 2 + len;
      break;
    }
    i += 2 + len;
  }

  if (MAXVAL === null) MAXVAL = (1 << P) - 1;
  // C.2.4.1.1 defaults (only used if LSE absent; our fixtures carry LSE)
  if (T1 === null) throw new Error("defaults not implemented; LSE expected");

  // ---- derived parameters (A.2.1 / A.5) ----
  const RANGE = Math.floor((MAXVAL + 2 * NEAR) / (2 * NEAR + 1)) + 1;
  const qbpp = Math.ceil(Math.log2(RANGE));
  const bpp = Math.max(2, Math.ceil(Math.log2(MAXVAL + 1)));
  const LIMIT = 2 * (bpp + Math.max(8, bpp));
  const AINIT = Math.max(2, Math.floor((RANGE + 32) / 64));

  const A = new Int32Array(367).fill(AINIT);
  const B = new Int32Array(365);
  const C = new Int32Array(365);
  const N = new Int32Array(367).fill(1);
  const Nn = new Int32Array(2); // for contexts 365 (RItype 0) and 366 (RItype 1)
  let RUNindex = 0;

  const reader = new JlsBitReader(buf, i);

  const golomb = (k, glimit) => {
    // A.5.3 limited-length Golomb decode
    let z = 0;
    while (reader.readBit() === 0) z++;
    if (z < glimit) return z * (1 << k) + reader.readBits(k);
    return reader.readBits(qbpp) + 1;
  };

  const quantize = (d) => {
    // C.2.3 gradient quantization (signs handled symmetrically)
    if (d <= -T3) return -4;
    if (d <= -T2) return -3;
    if (d <= -T1) return -2;
    if (d < -NEAR) return -1;
    if (d <= NEAR) return 0;
    if (d < T1) return 1;
    if (d < T2) return 2;
    if (d < T3) return 3;
    return 4;
  };

  const modRangeFix = (rx) => {
    if (rx < -NEAR) rx += RANGE * (2 * NEAR + 1);
    else if (rx > MAXVAL + NEAR) rx -= RANGE * (2 * NEAR + 1);
    if (rx < 0) rx = 0;
    else if (rx > MAXVAL) rx = MAXVAL;
    return rx;
  };

  // line buffers with 1 slack element each side; samples at 1..W
  let prev = new Int32Array(W + 2);
  let cur = new Int32Array(W + 2);

  const out = new Uint16Array(W * H);

  for (let y = 0; y < H; y++) {
    cur[0] = prev[1]; // Ra for x=0 is Rb; becomes Rc for the next line
    let x = 1;
    while (x <= W) {
      const Ra = cur[x - 1];
      const Rb = prev[x];
      const Rc = prev[x - 1];
      const Rd = prev[x + 1];
      const D1 = Rd - Rb;
      const D2 = Rb - Rc;
      const D3 = Rc - Ra;

      if (Math.abs(D1) <= NEAR && Math.abs(D2) <= NEAR && Math.abs(D3) <= NEAR) {
        // ---- run mode (A.7) ----
        const runVal = Ra;
        let interrupted = false;
        for (;;) {
          if (reader.readBit() === 1) {
            const segLen = 1 << J[RUNindex];
            const n = Math.min(segLen, W - x + 1);
            for (let f = 0; f < n; f++) cur[x++] = runVal;
            if (n === segLen && RUNindex < 31) RUNindex++;
            if (x > W) break; // run ended by end of line: no interruption sample
          } else {
            const cnt = J[RUNindex] > 0 ? reader.readBits(J[RUNindex]) : 0;
            for (let f = 0; f < cnt; f++) cur[x++] = runVal;
            interrupted = true;
            break;
          }
        }
        if (interrupted) {
          // ---- run interruption sample (A.7.2) ----
          const RaI = cur[x - 1];
          const RbI = prev[x];
          const RItype = Math.abs(RaI - RbI) <= NEAR ? 1 : 0;
          const Px = RItype === 1 ? RaI : RbI;
          const SIGN = RItype === 0 && RaI > RbI ? -1 : 1;
          const q = 365 + RItype;
          // A.7.2.1: TEMP = A[366] + (N[366]>>1) for RItype 1, A[365] for RItype 0
          const TEMP = RItype === 1 ? A[366] + (N[366] >> 1) : A[365];
          let k = 0;
          while (N[q] << k < TEMP) k++;
          const glimit = LIMIT - J[RUNindex] - 1;
          const EM = golomb(k, glimit);
          const tmp = EM + RItype;
          // invert the A.7.2.1 error mapping
          const cond = k === 0 && 2 * Nn[RItype] < N[q];
          let Errval;
          if (tmp === 0) Errval = 0;
          else if (cond) Errval = tmp % 2 === 1 ? (tmp + 1) / 2 : -(tmp / 2);
          else Errval = tmp % 2 === 0 ? tmp / 2 : -((tmp + 1) / 2);
          if (Errval < 0) Nn[RItype]++;

          const Rx = modRangeFix(Px + SIGN * Errval * (2 * NEAR + 1));
          cur[x++] = Rx;

          A[q] += (EM + 1 - RItype) >> 1;
          if (N[q] === RESET) {
            A[q] >>= 1;
            N[q] >>= 1;
            Nn[RItype] >>= 1;
          }
          N[q]++;
          if (RUNindex > 0) RUNindex--;
        }
      } else {
        // ---- regular mode (A.4-A.6) ----
        let Q1 = quantize(D1);
        let Q2 = quantize(D2);
        let Q3 = quantize(D3);
        let SIGN = 1;
        let q = 81 * Q1 + 9 * Q2 + Q3;
        if (q < 0) {
          SIGN = -1;
          q = -q;
        }
        q -= 1; // contexts 1..364 -> 0-based storage
        // MED predictor
        let Px;
        const minAB = Math.min(Ra, Rb);
        const maxAB = Math.max(Ra, Rb);
        if (Rc >= maxAB) Px = minAB;
        else if (Rc <= minAB) Px = maxAB;
        else Px = Ra + Rb - Rc;
        Px += SIGN * C[q];
        if (Px < 0) Px = 0;
        else if (Px > MAXVAL) Px = MAXVAL;

        let k = 0;
        while (N[q] << k < A[q]) k++;
        const MErr = golomb(k, LIMIT - qbpp - 1);
        let Errval;
        if (NEAR === 0 && k === 0 && 2 * B[q] <= -N[q]) {
          // inverted mapping under negative bias (A.5.4)
          Errval = MErr % 2 === 1 ? (MErr - 1) / 2 : -(MErr / 2) - 1;
        } else {
          Errval = MErr % 2 === 0 ? MErr / 2 : -((MErr + 1) / 2);
        }

        const Rx = modRangeFix(Px + SIGN * Errval * (2 * NEAR + 1));
        cur[x++] = Rx;

        // context update (A.6)
        B[q] += Errval * (2 * NEAR + 1);
        A[q] += Math.abs(Errval);
        if (N[q] === RESET) {
          A[q] >>= 1;
          B[q] >>= 1;
          N[q] >>= 1;
        }
        N[q]++;
        // bias computation (A.6.2)
        if (B[q] <= -N[q]) {
          B[q] += N[q];
          if (C[q] > MIN_C) C[q]--;
          if (B[q] <= -N[q]) B[q] = -N[q] + 1;
        } else if (B[q] > 0) {
          B[q] -= N[q];
          if (C[q] < MAX_C) C[q]++;
          if (B[q] > 0) B[q] = 0;
        }
      }
    }
    // copy decoded line to output, then swap buffers
    for (let xx = 1; xx <= W; xx++) out[y * W + xx - 1] = cur[xx];
    const t = prev;
    prev = cur;
    cur = t;
    prev[W + 1] = prev[W]; // Rd at the last column
  }

  const bytes = Buffer.alloc(out.length * 2);
  for (let k2 = 0; k2 < out.length; k2++) bytes.writeUInt16LE(out[k2], k2 * 2);
  return { bytes, NEAR, MAXVAL, T1, T2, T3, RESET, W, H, P };
}

module.exports = { decodeJLS };
