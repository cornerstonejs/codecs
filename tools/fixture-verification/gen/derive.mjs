// Deterministic transforms shared between fixture generation
// (generate-fixtures.mjs) and the tests that verify lossless round-trips:
// tests re-derive the expected pixels from the committed source RAWs with
// these exact functions, so no extra golden files are needed for lossless
// fixtures.

/**
 * CT2.RAW (int16le) -> Uint8Array: ((v + 32768) >> 4) & 0xff.
 * Takes bits 4..11 rather than the top byte: CT values span only ~12 bits,
 * so the top byte would give a ~16-gray-level image; this keeps rich,
 * high-frequency content that exercises both run and regular coding modes.
 */
export function gray8FromCT2(ct2Buffer) {
  const src = new Int16Array(ct2Buffer.buffer, ct2Buffer.byteOffset, ct2Buffer.length / 2);
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = ((src[i] + 32768) >> 4) & 0xff;
  return out;
}

/** CT2.RAW (int16le) -> 12-bit unsigned Uint16Array: (v + 32768) >> 4 */
export function gray12FromCT2(ct2Buffer) {
  const src = new Int16Array(ct2Buffer.buffer, ct2Buffer.byteOffset, ct2Buffer.length / 2);
  const out = new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = (src[i] + 32768) >> 4;
  return out;
}

/** CT2.RAW (int16le) -> 16-bit unsigned Uint16Array: v + 32768 */
export function gray16uFromCT2(ct2Buffer) {
  const src = new Int16Array(ct2Buffer.buffer, ct2Buffer.byteOffset, ct2Buffer.length / 2);
  const out = new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] + 32768;
  return out;
}

/**
 * CT2.RAW (int16le) -> bi-level Uint8Array, ONE BYTE PER SAMPLE, values 0/1:
 * gray8FromCT2(v) >= 128.
 *
 * A threshold of the 8-bit derivation rather than random bits, so the result is
 * an anatomical silhouette: long runs of a single value broken by an irregular,
 * high-frequency boundary. That is what makes a 1-bit row-stride or bit-order
 * mistake visible — uniform or periodic content survives both.
 *
 * One byte per sample is the layout the wasm codecs use for every depth up to
 * 8; use packBitsLsbFirst() to get the DICOM bit-packed form.
 */
export function bilevelFromCT2(ct2Buffer) {
  const gray8 = gray8FromCT2(ct2Buffer);
  const out = new Uint8Array(gray8.length);
  for (let i = 0; i < gray8.length; i++) out[i] = gray8[i] >= 128 ? 1 : 0;
  return out;
}

/**
 * One byte per sample (0/1) -> DICOM bit-packed BitsAllocated=1 PixelData:
 * the first sample occupies the least significant bit of the first byte
 * (PS3.5 8.1.1). The inverse of dicom-codec's codecFactory.unpackBits.
 */
export function packBitsLsbFirst(samples) {
  const out = new Uint8Array(Math.ceil(samples.length / 8));
  for (let i = 0; i < samples.length; i++) {
    if (samples[i]) out[i >> 3] |= 1 << (i & 7);
  }
  return out;
}

/** interleaved RGBRGB... -> [RRR..., GGG..., BBB...] plane buffers */
export function deinterleavePlanes(buf, samples) {
  const frameSize = buf.length / samples;
  const planes = [];
  for (let s = 0; s < samples; s++) {
    const plane = Buffer.alloc(frameSize);
    for (let i = 0; i < frameSize; i++) plane[i] = buf[i * samples + s];
    planes.push(plane);
  }
  return planes;
}

/** PackBits-encode one DICOM RLE segment (PS3.5 G.3.1), padded to even length */
export function packBitsSegment(plane) {
  const out = [];
  let i = 0;
  while (i < plane.length) {
    // find run length at i
    let run = 1;
    while (run < 128 && i + run < plane.length && plane[i + run] === plane[i]) run++;
    if (run >= 2) {
      out.push(Buffer.from([256 - (run - 1), plane[i]])); // replicate: -(run-1) as int8
      i += run;
    } else {
      // literal run: gather until next replicate run of >=3 or 128 bytes
      let lit = i + 1;
      while (
        lit < plane.length &&
        lit - i < 128 &&
        !(lit + 2 < plane.length && plane[lit] === plane[lit + 1] && plane[lit] === plane[lit + 2])
      ) {
        lit++;
      }
      const chunk = plane.subarray(i, lit);
      out.push(Buffer.from([chunk.length - 1]), chunk);
      i = lit;
    }
  }
  let seg = Buffer.concat(out);
  if (seg.length % 2) seg = Buffer.concat([seg, Buffer.from([0x00])]); // pad per PS3.5 G.3.1
  return seg;
}
