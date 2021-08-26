/* eslint no-bitwise: 0 */
function swap16(val) {
  return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}
  
/**
 * Decodes the provided pixelData and sets the `pixelData` property
 * of the imageFrame object to the decoded representation.
 * 
 * Set pixelData will be `Uint16Array` if `pixelRepresentation` is 0,
 * otherwise it will be an `Int16Array`
 * 
 * @param {object} imageFrame
 * @param {number} imageFrame.bitsAllocated - 16 or 8
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
  } else if (imageFrame.bitsAllocated === 8) {
    imageFrame.pixelData = pixelData;
  }

  return imageFrame;
}
  
export default decode;