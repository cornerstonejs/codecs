/* eslint no-bitwise: 0 */
function swap16(val) {
  return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}

function swap32(val) {
  return (
    ((val & 0xff) << 24) |
    ((val & 0xff00) << 8) |
    ((val >> 8) & 0xff00) |
    ((val >> 24) & 0xff)
  );
}

/**
 * Decodes the provided pixelData and sets the `pixelData` property
 * of the imageFrame object to the decoded representation.
 *
 * 16-bit and 32-bit data are byte-swapped and become unsigned
 * (`pixelRepresentation` 0) or signed (`pixelRepresentation` 1) integer
 * arrays. 32-bit data with no `pixelRepresentation` is treated as float
 * (e.g. FloatPixelData), mirroring the little-endian package.
 *
 * @param {object} imageFrame
 * @param {number} imageFrame.bitsAllocated - 32, 16, 8 or 1
 * @param {number} imageFrame.pixelRepresentation - 0 or 1
 * @param {*} pixelData
 */
function decode(imageFrame, pixelData) {
  if (imageFrame.bitsAllocated === 16) {
    let arrayBuffer = pixelData.buffer;

    let offset = pixelData.byteOffset;
    const length = pixelData.length;
    // if pixel data is not aligned on even boundary, shift it so we can create the 16 bit array
    // buffers on it

    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }

    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint16Array(arrayBuffer, offset, length / 2);
    } else {
      imageFrame.pixelData = new Int16Array(arrayBuffer, offset, length / 2);
    }
    // Do the byte swap
    for (let i = 0; i < imageFrame.pixelData.length; i++) {
      imageFrame.pixelData[i] = swap16(imageFrame.pixelData[i]);
    }
  } else if (imageFrame.bitsAllocated === 8 || imageFrame.bitsAllocated === 1) {
    // 1-bit data must already be extracted per frame by the caller:
    // multi-frame 1-bit pixel data is bit-packed across frame boundaries,
    // so frame extraction cannot happen at this level
    imageFrame.pixelData = pixelData;
  } else if (imageFrame.bitsAllocated === 32) {
    let arrayBuffer = pixelData.buffer;

    let offset = pixelData.byteOffset;
    const length = pixelData.length;
    // pixelData is typically a view into the full DICOM P10 buffer, so its
    // byteOffset is even (DICOM guarantees even lengths) but not necessarily
    // 4-byte aligned; 32-bit typed-array views require 4-byte alignment,
    // so copy the bytes to a fresh, aligned buffer when needed
    if (offset % 4) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }

    // The swap is a pure byte permutation, so it is done through a
    // Uint32Array view regardless of how the result is interpreted below
    const swapView = new Uint32Array(arrayBuffer, offset, length / 4);
    for (let i = 0; i < swapView.length; i++) {
      swapView[i] = swap32(swapView[i]);
    }

    // 32-bit PixelData is integer data (signed per pixelRepresentation);
    // it is only float when pixelRepresentation is absent (e.g. the
    // FloatPixelData element), matching cornerstone3D's decodeLittleEndian
    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = swapView;
    } else if (imageFrame.pixelRepresentation === 1) {
      imageFrame.pixelData = new Int32Array(arrayBuffer, offset, length / 4);
    } else {
      imageFrame.pixelData = new Float32Array(arrayBuffer, offset, length / 4);
    }
  }

  return imageFrame;
}
  
export default decode;