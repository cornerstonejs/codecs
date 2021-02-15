const charls = require('../dist/charlsjs.js')

let resolveIt
let rejectIt

const charlsInitialized = new Promise((resolve, reject) => {
    resolveIt = resolve
    rejectIt = reject
})

charls.onRuntimeInitialized = async _ => {
    // Now you can use it
    resolveIt()
}

const decode = async (compressedImageFrame, imageInfo) => {
    // make sure charls is fully initialized
    await charlsInitialized

    // Create a decoder instance
    const decoder = new charls.JpegLSDecoder();
    
    // get pointer to the source/encoded bit stream buffer in WASM memory
    // that can hold the encoded bitstream
    const encodedBufferInWASM = decoder.getEncodedBuffer(compressedImageFrame.length);
    
    // copy the encoded bitstream into WASM memory buffer
    encodedBufferInWASM.set(compressedImageFrame);
    
    // decode it
    decoder.decode();
    
    // get information about the decoded image
    const frameInfo = decoder.getFrameInfo();
    const interleaveMode = decoder.getInterleaveMode();
    const nearLossless = decoder.getNearLossless();
    
    // get the decoded pixels
    const decodedPixelsInWASM = decoder.getDecodedBuffer();

    const imageFrame = new Uint8Array(decodedPixelsInWASM.length)
    imageFrame.set(decodedPixelsInWASM)

    const encodedImageInfo = {
        columns: frameInfo.width,
        rows: frameInfo.height,
        bitsPerPixel: frameInfo.bitsPerSample,
        signed: imageInfo.signed,
        componentsPerPixel: frameInfo.componentCount
    }

    // delete the instance.  Note that this frees up memory including the
    // encodedBufferInWASM and decodedPixelsInWASM invalidating them. 
    // Do not use either after calling delete!
    decoder.delete();

    const encodeOptions = {
        nearLossless,
        interleaveMode,
        frameInfo : frameInfo
    }

    return {
        imageFrame,
        imageInfo : encodedImageInfo,
        encodeOptions
    }
}

const encode = async (imageFrame, imageInfo, encodeOptions) => {
    const encodedImageFrame = new Uint8Array(0)

    return {
        encodedImageFrame,
        imageInfo,
        encodeOptions
    }
}

module.exports = {
    encode,
    decode
}