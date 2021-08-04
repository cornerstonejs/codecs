const jpeglscodec = require('./jpeglscodec')
const jpeg2000codec = require('./jpeg2000codec')
const htj2kcodec = require('./htj2kcodec')

const codecs = {
    '1.2.840.10008.1.2.4.80' : jpeglscodec,
    '1.2.840.10008.1.2.4.81' : jpeglscodec,
    '1.2.840.10008.1.2.4.90' : jpeg2000codec,
    '1.2.840.10008.1.2.4.91' : jpeg2000codec,
    'htj2k' : htj2kcodec,
}

const getCodec = (transferSyntaxUID) => {
    const codec = codecs[transferSyntaxUID]
    if(!codec) {
        throw new Error('unknown transfer syntax UID ' + transferSyntaxUID)
    }
    return codec
}

const decode = async (compressedImageFrame, sourceTransferSyntaxUID, imageInfo) => {
    const codec = getCodec(sourceTransferSyntaxUID)
    return codec.decode(compressedImageFrame, imageInfo)
}

const encode = async (imageFrame, targetTransferSyntaxUID, imageInfo, encodeOptions) => {
    const codec = getCodec(targetTransferSyntaxUID)
    return codec.encode(imageFrame, imageInfo, encodeOptions)
}

const transcode = async (compressedImageFrame, sourceTransferSyntaxUID, imageInfo, targetTransferSyntaxUID, encodeOptions) => {
    const decoded = await decode(compressedImageFrame, sourceTransferSyntaxUID, imageInfo)
    return encode(decoded.imageFrame, targetTransferSyntaxUID, decoded.imageInfo, encodeOptions)
}

const dicomCodec = {
    decode,
    encode,
    transcode
}

module.exports = dicomCodec