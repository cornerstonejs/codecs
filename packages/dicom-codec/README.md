# dicom-codec

DICOM Codecs for JavaScript

# Features

Currently Implemented:
- JPEG-LS decoding
- HTJ2K encoding

Short Term:
- JPEG-LS encoding
- HTJ2K decoding
- JPEG2000 encoding
- JPEG2000 decoding

Longer Term:
- the rest of the DICOM transfer syntaxes (JPEG baseline, rle, etc)

# Building

```
# Restore packages
yarn

# Build
yarn run build
```

# API

## decode

async function that decodes an image

Parameters:
- compressedImageFrame - Uint8Array with the compressed image frame bytes
- sourceTransferSyntaxUID - String with the transfer syntax uid of the compressed image frame
- imageInfo - Object
    - rows - Number with the image rows/height
    - columns - Number with the image columns/width
    - bitsPerPixel - Number with bits per pixel
    - componentsPerPixel - Number with number of components per pixel. 
    - signed - Boolean true if pixel data is signed, false if unsigned

Returns:
- Object
    - imageFrame - Uint8Array with the uncompressed image frame bytes
    - imageInfo - Object
        - rows - Number with the image rows/height
        - columns - Number with the image columns/width
        - bitsPerPixel - Number with bits per pixel
        - componentsPerPixel - Number with number of components per pixel. 
        - signed - Boolean true if pixel data is signed, false if unsigned
    - encodeOptions - Object with contents specific to each codec (see below)

## encode

async function that encodes an image

Parameters:
- imageFrame - Uint8Array with the uncompressed image frame bytes
- targetTransferSyntaxUID - String with the transfer syntax uid to encode the image frame as
- imageInfo - Object
    - rows - Number with the image rows/height
    - columns - Number with the image columns/width
    - bitsPerPixel - Number with bits per pixel
    - componentsPerPixel - Number with number of components per pixel. 
    - signed - Boolean true if pixel data is signed, false if unsigned
- encodeOptions - Object - contents specific to each codec (see below)

Returns:
- Object
   - encodedImageFrame - Uint8Array with the encoded image frame bytes
   - imageInfo - Object
        - rows - Number with the image rows/height
        - columns - Number with the image columns/width
        - bitsPerPixel - Number with bits per pixel
        - componentsPerPixel - Number with number of components per pixel. 
        - signed - true if pixel data is signed, false if unsigned
    - encodeOptions - Object - contents specific to each codec

## transcode

async function that transcodes an image (decodes and then encodes)

Parameters:
- compressedImageFrame - Uint8Array with the compressed image frame bytes
- sourceTransferSyntaxUID - String with the transfer syntax uid of the compressed image frame
- imageInfo - Object
    - rows - Number with the image rows/height
    - columns - Number with the image columns/width
    - bitsPerPixel - Number with bits per pixel
    - componentsPerPixel - Number with number of components per pixel. 
    - signed - Boolean true if pixel data is signed, false if unsigned
- targetTransferSyntaxUID - String with the transfer syntax uid to encode the image frame as
- encodeOptions - Object - contents specific to each codec (see below)

Returns:
- Object
    - encodedImageFrame - Uint8Array with the encoded image frame bytes
    - imageInfo - Object
        - rows - Number with the image rows/height
        - columns - Number with the image columns/width
        - bitsPerPixel - Number with bits per pixel
        - componentsPerPixel - Number with number of components per pixel. 
        - signed - true if pixel data is signed, false if unsigned
    - encodeOptions - Object - contents specific to each codec


## TransferSyntax Specific Encoding Options

### JPEG2000 / OpenJPEG

TransferSyntaxUIDs:
- 1.2.840.10008.1.2.4.90 JPEG 2000 Image Compression (Lossless Only)
- 1.2.840.10008.1.2.4.91 JPEG 2000 Image Compression

Encode Options:
- Object
  - decompositions - Number (default is 5)
  - lossless - Boolean (default is true)
  - progressionOrder - Number - one of the following
    - 0 LRPC
    - 1 RLCP
    - 2 RPCL (default)
    - 3 PCRL
    - 4 CPRL
  - blockDimensions - Number - default is 64 (64x64)
  - encodeLayerCount - Number - default is 1
  - layerCompressionRatios - Array of Numbers with length === encodeLayerCount

### JPEG-LS

TransferSyntaxUIDs:
- 1.2.840.10008.1.2.4.80 JPEG-LS Lossless Image Compression
- 1.2.840.10008.1.2.4.81 JPEG-LS Lossy (Near-Lossless) Image Compression

Encode Options:
- Object
  - interleaveMode - Number - one of the following
    - 0 - None (RRRRGGGGBBBB)
    - 1 - Line (RRGGBBRRGGBB)
    - 2 - Sample (RGBRGBRGBRGB)
  - nearLossless - Number - NEAR parameter - default is 0, higher numbers produce lossy images

### HTJ2K

TransferSyntaxUIDs:
- "HTJ2K"

Encode Options:
- Object
  - decompositions - Number (default is 5)
  - lossless - Boolean (default is true)
  - quantizationStep - Number (default is -1.0)
  - progressionOrder - Number - one of the following
    - 0 LRPC
    - 1 RLCP
    - 2 RPCL (default)
    - 3 PCRL
    - 4 CPRL
  - blockDimensions - Number - default is 64 (64x64)