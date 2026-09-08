# @cornerstonejs/codec-libjxl

JavaScript/WebAssembly build of [libjxl](https://github.com/libjxl/libjxl)
with separate decoder and encoder modules for JPEG XL DICOM images.

## Installing

Using npm:

```bash
npm install @cornerstonejs/codec-libjxl
```

Using yarn:

```bash
yarn add @cornerstonejs/codec-libjxl
```

## Usage

The package exports separate JavaScript loaders and WASM binaries for decoding
and encoding:

- `@cornerstonejs/codec-libjxl/decodewasmjs`
- `@cornerstonejs/codec-libjxl/decodewasm`
- `@cornerstonejs/codec-libjxl/encodewasmjs`
- `@cornerstonejs/codec-libjxl/encodewasm`

### Decoder

```js
import createJpegXLDecoder from '@cornerstonejs/codec-libjxl/decodewasmjs';

const codec = await createJpegXLDecoder();
const decoder = new codec.JpegXLDecoder();

decoder.getEncodedBuffer(bitstream.length).set(bitstream);
decoder.decode();

const frameInfo = decoder.getFrameInfo();
const decodedPixels = decoder.getDecodedBuffer();
```

### Encoder

```js
import createJpegXLEncoder from '@cornerstonejs/codec-libjxl/encodewasmjs';

const codec = await createJpegXLEncoder();
const encoder = new codec.JpegXLEncoder();
const frameInfo = {
  width,
  height,
  bitsPerSample,
  componentCount,
  isSigned: false,
};

encoder.getDecodedBuffer(frameInfo).set(decodedPixels);
encoder.setLossless(true);
encoder.encode();

const bitstream = encoder.getEncodedBuffer();
```

The encoder accepts greyscale samples with one channel or RGB samples with
three channels at bit depths from 1 to 16. Copy returned buffer views before
the next operation or before calling `releaseBuffers()`.

## Building

This project uses a Git submodule for libjxl. Initialize the submodules from
the repository root:

```bash
git submodule update --init --recursive
```

An activated Emscripten SDK is required. Build both WASM modules with:

```bash
cd packages/libjxl
yarn build
```

The generated decoder and encoder `.js` and `.wasm` files are written to
`dist/`.
