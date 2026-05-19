# @cornerstonejs/codec-big-endian

Pure-JS decoder for the DICOM Big-Endian transfer syntax
(`1.2.840.10008.1.2.2`).

Reinterprets `pixelData` as `Uint16Array` or `Int16Array` (based on
`pixelRepresentation`) and byte-swaps each 16-bit sample to little-endian
in place. 8-bit data passes through unchanged.

## API

```js
import decode from "@cornerstonejs/codec-big-endian"

decode(imageFrame, pixelData)
// → mutates imageFrame.pixelData to a swapped typed-array view
// → returns imageFrame
```

`imageFrame.bitsAllocated` must be `8` or `16`.

## Testing

```bash
yarn run test
```
