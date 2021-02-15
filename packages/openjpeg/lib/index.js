const openjpeg = require('../dist/openjpegjs.js')

let resolveIt
let rejectIt

const openjpegInitialized = new Promise((resolve, reject) => {
    resolveIt = resolve
    rejectIt = reject
})

openjpeg.onRuntimeInitialized = async _ => {
    // Now you can use it
    resolveIt()
}

const decode = async (compressedImageFrame, imageInfo) => {
    await openjpegInitialized

    const imageFrame = new Uint8Array(0)
    const encodeOptions = {}

    return {
        imageFrame,
        imageInfo,
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