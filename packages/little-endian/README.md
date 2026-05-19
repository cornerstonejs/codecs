# @cornerstonejs/codec-little-endian

Pure-JS decoder for DICOM Little-Endian transfer syntaxes
(`1.2.840.10008.1.2`, `1.2.840.10008.1.2.1`, `1.2.840.10008.1.2.1.99`).

Takes a `pixelData` byte view and reinterprets it as `Uint8Array`, `Uint16Array`,
`Int16Array`, or `Float32Array` based on `imageFrame.bitsAllocated` and
`imageFrame.pixelRepresentation`. No transcoding — this is metadata-driven
view-casting, with realignment when `byteOffset` is odd.

## API

```js
import decode from "@cornerstonejs/codec-little-endian"

decode(imageFrame, pixelData)
// → mutates imageFrame.pixelData to a typed-array view
// → returns imageFrame
```

`imageFrame.bitsAllocated` must be `1`, `8`, `16`, or `32`.

## Testing

```bash
yarn run test
```
