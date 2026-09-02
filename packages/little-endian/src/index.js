/**
 * Decodes the provided pixelData and sets the `pixelData` property
 * of the imageFrame object to the decoded representation.
 *
 * 16-bit and 32-bit data become unsigned (`pixelRepresentation` 0) or
 * signed (`pixelRepresentation` 1) integer arrays. 32-bit data with no
 * `pixelRepresentation` is treated as float (e.g. FloatPixelData),
 * matching cornerstone3D's decodeLittleEndian.
 *
 * @param {object} imageFrame
 * @param {number} imageFrame.bitsAllocated - 32, 16, 8 or 1
 * @param {number} imageFrame.pixelRepresentation - 0 or 1
 * @param {*} pixelData
 */
function decode(imageFrame, pixelData) {
  let arrayBuffer = pixelData.buffer;

  let offset = pixelData.byteOffset;
  const length = pixelData.length;

  if (imageFrame.bitsAllocated === 16) {
    // if pixel data is not aligned on even boundary, shift it so we can create the 16 bit array
    // buffers on it.
    //
    // The end bound is not optional. slice(offset) copies through the end of
    // the BACKING buffer, and pixelData is typically a single frame's view into
    // a whole multi-frame P10 buffer — so the one-argument form allocates and
    // copies the entire rest of the file to realign one frame (measured: 67 MB
    // for a 1 MB frame in a 64 MB buffer). The returned view's length hides it,
    // because it is correct either way.
    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset, offset + pixelData.byteLength);
      offset = 0;
    }

    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint16Array(arrayBuffer, offset, length / 2);
    } else {
      imageFrame.pixelData = new Int16Array(arrayBuffer, offset, length / 2);
    }
  } else if (imageFrame.bitsAllocated === 8 || imageFrame.bitsAllocated === 1) {
    // 1-bit data must already be extracted per frame by the caller:
    // multi-frame 1-bit pixel data is bit-packed across frame boundaries,
    // so frame extraction cannot happen at this level
    imageFrame.pixelData = pixelData;
  } else if (imageFrame.bitsAllocated === 32) {
    // pixelData is typically a view into the full DICOM P10 buffer, so its
    // byteOffset is even (DICOM guarantees even lengths) but not necessarily
    // 4-byte aligned; 32-bit typed-array views require 4-byte alignment,
    // so copy the bytes to a fresh, aligned buffer when needed — bounded to
    // this frame, for the reason given on the 16-bit branch above
    if (offset % 4) {
      arrayBuffer = arrayBuffer.slice(offset, offset + pixelData.byteLength);
      offset = 0;
    }

    // 32-bit PixelData is integer data (signed per pixelRepresentation);
    // it is only float when pixelRepresentation is absent (e.g. the
    // FloatPixelData element), matching cornerstone3D's decodeLittleEndian
    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint32Array(arrayBuffer, offset, length / 4);
    } else if (imageFrame.pixelRepresentation === 1) {
      imageFrame.pixelData = new Int32Array(arrayBuffer, offset, length / 4);
    } else {
      imageFrame.pixelData = new Float32Array(arrayBuffer, offset, length / 4);
    }
  }

  return imageFrame;
}
  
  export default decode;
  