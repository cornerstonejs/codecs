# dicom-codec

DICOM Codecs for JavaScript (browser and node support).

# Features (v0.0.10)
| codec name        	| transferSyntaxUID(s)                                         	| decode 	| encode 	| external codec 	| js/wasm based 	|
|-------------------	|--------------------------------------------------------------	|:------:	|:------:	|:---------------:	|:-------------:	|
| LittleEndian      	| 1.2.840.10008.1.2 1.2.840.10008.1.2.1 1.2.840.10008.1.2.1.99 	|    -   	|    -   	|        -        	|       -       	|
| BigEndian         	| 1.2.840.10008.1.2.2                                          	|    -   	|    -   	|        -         	|          -     	|
| LibjpegTurbo8Bit  	| 1.2.840.10008.1.2.4.50                                       	|    X   	|    X   	|        X        	|       X       	|
| LibjpegTurbo12Bit 	| 1.2.840.10008.1.2.4.51                                       	|    -   	|    -   	|        -        	|       -       	|
| JpegLossless      	| 1.2.840.10008.1.2.4.57 1.2.840.10008.1.2.4.70                	|    X   	|    -   	|        X        	|       -       	|
| Jpegls            	| 1.2.840.10008.1.2.4.80 1.2.840.10008.1.2.4.81                	|    X   	|    X   	|        X        	|       X       	|
| Jpeg2000          	| 1.2.840.10008.1.2.4.90 1.2.840.10008.1.2.4.91                	|    X   	|    X   	|        X        	|       X       	|
| HTJ2K          	| 1.2.840.10008.1.2.4.96 (Provisional)                	|    X   	|    X   	|        X        	|       X       	|
| RleLossless       	| 1.2.840.10008.1.2.5                                          	|    X   	|    -   	|        -        	|       -       	|

### Next releases planning
v0.0.11: support for LibjpegTurbo12Bit.
v.0.0.12 support for encoding options.
v1.0.0: support for browser (dynamic loading included) and node.

### Future releases
- RleLossless to be js/wasm based.
- Support for the rest of operations for existing codecs.
- Support for the rest of the DICOM transfer syntaxes.

# Building

```
# Restore packages
yarn

# Build
yarn run build
```
# How to use
Commonjs
```
const dicomCodec = require('@cornerstonejs/dicom-codec');
....
const imageFrame = ....// see API
const imageInfo = {} // add here image information (see API)
const result = await dicomCodec.transcode(imageFrame, imageInfo, sourceTransferSyntaxUID, targetTransferSyntaxUID);
const pixelData = dicomCodec.getPixelData(result.imageFrame, result.imageInfo);
```
ES6
```
import dicomCodec from '@cornerstonejs/dicom-codec';
...
const imageFrame = ....// see API
const imageInfo = {} // add here image information (see API)
const result = await dicomCodec.transcode(imageFrame, imageInfo, sourceTransferSyntaxUID, targetTransferSyntaxUID);
const pixelData = dicomCodec.getPixelData(result.imageFrame, result.imageInfo);
```



# API

## decode

async function that decodes an image

Parameters (**It does not mutate any param**):
- compressedImageFrame - TypedArray with the compressed image frame bytes.
- imageInfo - Object
    - rows - Number with the image rows/height.
    - columns - Number with the image columns/width.
    - bitsAllocated - Number with bits per pixel sample.
    - samplesPerPixel - Number with number of components per pixel.
    - signed - Boolean true if pixel data is signed, false if unsigned.
- sourceTransferSyntaxUID - String with the transfer syntax uid of the compressed image frame

Returns:
- Object
    - imageFrame - TypedArray with the uncompressed image frame bytes (Mostly codecs returns Uint8Array, but Uint16Array, Int16Array can be seen)
    - imageInfo - Object
        - rows - Number with the image rows/height.
        - columns - Number with the image columns/width.
        - bitsAllocated - Number with bits per pixel sample.
        - samplesPerPixel - Number with number of components per pixel.
        - signed - Boolean true if pixel data is signed, false if unsigned.
        - there are also some other codec properties.

Decode does not occur if there is no codec for sourceTransferSyntaxUID or related codec's transferSyntaxUID refers to uncompressed.

## encode

async function that encodes an image

Parameters (**It does not mutate any param**):
- imageFrame - TypedArray with the uncompressed image frame bytes
- imageInfo - Object
    - rows - Number with the image rows/height.
    - columns - Number with the image columns/width.
    - bitsAllocated - Number with bits per pixel sample.
    - samplesPerPixel - Number with number of components per pixel.
    - signed - Boolean true if pixel data is signed, false if unsigned.
- targetTransferSyntaxUID - String with the transfer syntax uid to encode the image frame as
- encodeOptions - Object - contents specific to each codec (see below) (v>=0.0.12)

Returns:
- Object
    - imageFrame - TypedArray with the image frame bytes (Mostly codecs returns Uint8Array, but Uint16Array, Int16Array can be seen)
    - imageInfo - Object
        - rows - Number with the image rows/height.
        - columns - Number with the image columns/width.
        - bitsAllocated - Number with bits per pixel sample.
        - samplesPerPixel - Number with number of components per pixel.
        - signed - Boolean true if pixel data is signed, false if unsigned.
        - there are also some other codec properties.
    - processInfo - Object
        - duration - Number with process'duration in ms.


Encode does not occur if there is no codec for targetTransferSyntaxUID or related codec's transferSyntaxUID refers to uncompressed.

## transcode

async function that transcodes an image (decodes and then encodes)

Parameters (**It does not mutate any param**):
- imageFrame - TypedArray with the image frame bytes
- imageInfo - Object
    - rows - Number with the image rows/height.
    - columns - Number with the image columns/width.
    - bitsAllocated - Number with bits per pixel sample.
    - samplesPerPixel - Number with number of components per pixel.
    - signed - Boolean true if pixel data is signed, false if unsigned.
- sourceTransferSyntaxUID - String with the transfer syntax uid of the compressed.
- targetTransferSyntaxUID - String with the transfer syntax uid to encode the image frame as.
- encodeOptions - Object - contents specific to each codec (see below) (v>=0.0.12)

Returns:
- Object
    - imageFrame - TypedArray with the uncompressed image frame bytes (Mostly codecs returns Uint8Array, but Uint16Array, Int16Array can be seen)
    - imageInfo - Object
        - rows - Number with the image rows/height.
        - columns - Number with the image columns/width.
        - bitsAllocated - Number with bits per pixel sample.
        - samplesPerPixel - Number with number of components per pixel.
        - signed - Boolean true if pixel data is signed, false if unsigned.
        - there are also some other codec properties.
    - processInfo - Object
        - duration - Number with process'duration in ms.

Transcode might not occur depending on transferSyntaxUID's params (see above).

## getPixelData

function that returns formatted imageFrame based on imageInfo
Some of codecs might have specific rules for pixelData based on imageInfo.

Parameters (**It does not mutate any param**):
- imageFrame - TypedArray with the uncompressed image frame bytes
- imageInfo - Object
    - rows - Number with the image rows/height.
    - columns - Number with the image columns/width.
    - bitsAllocated - Number with bits per pixel sample.
    - samplesPerPixel - Number with number of components per pixel. 
    - signed - Boolean true if pixel data is signed, false if unsigned.

Returns:
- Object
    - imageFrame - TypedArray with the image frame bytes (Mostly codecs returns Uint8Array, but Uint16Array, Int16Array can be seen). Each codec might treat this differently based on imageInfo.

## setConfig

function that set up dicom-codec configuration properties
Parameters (**It does not mutate any param**):
- options - Object
    - verbose - Boolean true if dicom-codec should be verbose, false otherwise.

## TransferSyntax Specific Encoding Options

TBD
