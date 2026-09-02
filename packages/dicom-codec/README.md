# dicom-codec

DICOM codecs for JavaScript, with browser and Node.js support.

# Features (v1.0.1)
| codec name        	| transferSyntaxUID(s)                                         	| decode 	| encode 	| external codec 	| js/wasm based 	|
|-------------------	|--------------------------------------------------------------	|:------:	|:------:	|:---------------:	|:-------------:	|
| LittleEndian      	| 1.2.840.10008.1.2 1.2.840.10008.1.2.1 1.2.840.10008.1.2.1.99 	|    -   	|    -   	|        -        	|       -       	|
| BigEndian         	| 1.2.840.10008.1.2.2                                          	|    -   	|    -   	|        -         	|          -     	|
| LibjpegTurbo8Bit  	| 1.2.840.10008.1.2.4.50                                       	|    X   	|    X   	|        X        	|       X       	|
| LibjpegTurbo12Bit 	| 1.2.840.10008.1.2.4.51                                       	|    -   	|    -   	|        -        	|       -       	|
| JpegLossless      	| 1.2.840.10008.1.2.4.57 1.2.840.10008.1.2.4.70                	|    X   	|    -   	|        X        	|       -       	|
| Jpegls            	| 1.2.840.10008.1.2.4.80 1.2.840.10008.1.2.4.81                	|    X   	|    X   	|        X        	|       X       	|
| Jpeg2000          	| 1.2.840.10008.1.2.4.90 1.2.840.10008.1.2.4.91                	|    X   	|    X   	|        X        	|       X       	|
| JpegXL            	| 1.2.840.10008.1.2.4.110 1.2.840.10008.1.2.4.111 1.2.840.10008.1.2.4.112 	|    X   	|  X except .111 	|        X        	|       X       	|
| RleLossless       	| 1.2.840.10008.1.2.5                                          	|    X   	|    -   	|        -        	|       -       	|
| HTJ2K             	| 1.2.840.10008.1.2.202 (201,203 as well)                      	|    X   	|    X   	|        X        	|       X       	|

### Next releases planning
v0.0.11: support for LibjpegTurbo12Bit
v.0.0.12 support for encoding options.
v1.0.0: support for browser (dynamic loading included) and node.

### Future releases
- RleLossless to be js/wasm based.
- Support for the rest of operations for existing codecs.
- Support for the rest of the DICOM transfer syntaxes.

# Building

```
# Restore packages
pnpm install

# Build
pnpm run build
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
Parameters (**It does not mutate any param** ):
- options - Object
    - verbose - Boolean true if dicom-codec should be verbose, false otherwise.

## TransferSyntax Specific Encoding Options

### JPEG XL

Transfer syntax `1.2.840.10008.1.2.4.110` always uses lossless encoding.
Transfer syntax `1.2.840.10008.1.2.4.111` supports decoding only because the
pixel encoder does not create JPEG reconstruction data.

Transfer syntax `1.2.840.10008.1.2.4.112` accepts these encoding options:

- `lossless`: Boolean, defaults to `true`.
- `distance`: Butteraugli distance from 0 to 25 for lossy encoding. Defaults to
  `1.0` — cjxl's default, "visually lossless" — when `lossless` is `false` and
  no distance is given. Do not rely on libjxl's own default of 0: it reaches
  distance 0 through VarDCT rather than the modular path, which is larger than
  a real lossless encode and still not lossless.
- `effort`: Integer from 1 to 9.
- `decodingSpeed`: Integer from 0 to 4.

#### Signed pixel data

JPEG XL has no signed sample type — `JxlDataType` is unsigned integer or float
— so Pixel Representation cannot be carried in the codestream. PS3.5 8.2.15
allows Pixel Representation to be 1 for monochrome JPEG XL images but defines
no mechanism for it, so the mapping is a convention. This library uses a
different one per transfer syntax, and applies it automatically:

| Transfer syntax | Signed samples |
|---|---|
| `.110` Lossless | Passed through as two's complement. Byte-exact round trip; the bare codestream reads as unsigned and any reader that applies Pixel Representation itself agrees. |
| `.112` | Level-shifted up by half the sample range before encoding and back after decoding. |

`.112` needs the shift because as unsigned, a CT frame's `[-2048, 1704]`
becomes `[0, 1704]` plus `[63488, 65535]`, and lossy coding smears across the
gap: 2211 HU of maximum error at distance 1.0 without it. The shift is applied
to every signed `.112` frame, lossless option or not, so that decoding can
invert it knowing only the transfer syntax.

Two consequences worth knowing:

- A signed frame produces different bytes under `.110` and `.112`. Both decode
  back to the same pixels here, but a `.112` stream read by a decoder that
  assumes two's complement is off by `2^(BitsStored-1)`. Nothing in the
  standard distinguishes the conventions.
- Butteraugli distance is relative to the full `BitsAllocated` range. CT
  occupies roughly 6% of a 16-bit range, so distance 1.0 still permits
  hundreds of HU of error. Use a small distance, or `.110`, when HU fidelity
  matters.

The same limitation applies to JPEG-LS, which also has no sign flag; this
library only ever encodes JPEG-LS losslessly for that reason.

## Testing

```bash
pnpm run test   # run vitest dispatch + integration tests
```

The integration tests require every underlying wasm codec's `dist/` to be built
locally; otherwise they skip cleanly. CI builds everything first.
