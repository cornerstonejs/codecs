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
 * Set pixelData will be `Uint16Array` if `pixelRepresentation` is 0,
 * otherwise it will be an `Int16Array`. 32-bit data is byte-swapped
 * into a `Float32Array`, mirroring the little-endian package.
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
    imageFrame.pixelData = pixelData;
  } else if (imageFrame.bitsAllocated === 32) {
    let arrayBuffer = pixelData.buffer;

    let offset = pixelData.byteOffset;
    const length = pixelData.length;
    // Float32Array views must be 4-byte aligned; shift unaligned data
    if (offset % 4) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }

    const swapView = new Uint32Array(arrayBuffer, offset, length / 4);
    for (let i = 0; i < swapView.length; i++) {
      swapView[i] = swap32(swapView[i]);
    }

    imageFrame.pixelData = new Float32Array(arrayBuffer, offset, length / 4);
  }

  return imageFrame;
}
  
export default decode;