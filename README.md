# codecs

## Packages

This repository is maintained as a monorepo. This means that this repository, instead of containing a single project, contains many projects. If you explore our project structure, you'll see the following:

```bash
.
├── packages                #
│   ├── charls-js           # 
│   ├── libjpeg-turbojs     # 
│   └── openjpegjs          #
│
├── ...                     # misc. shared configuration
├── lerna.json              # MonoRepo (Lerna) settings
├── package.json            # Shared devDependencies and commands
└── README.md               # This file
```

### Transfer Syntaxes

> ℹ List of DICOM Transfer syntaxes: [https://www.dicomlibrary.com/dicom/transfer-syntax/](https://www.dicomlibrary.com/dicom/transfer-syntax/)



| Transfer Syntax UID    | Transfer Syntax Name                                                | Codec          |
|------------------------|---------------------------------------------------------------------|----------------|
| Uncompressed           |                                                                     |                |
| 1.2.840.10008.1.2      | Implicit VR Little Endian: Default DICOM Transfer Syntax            | Little Endian  |
| 1.2.840.10008.1.2.1    | Explicit VR Little Endian                                           | Little Endian  |
| 1.2.840.10008.1.2.2    | Explicit VR Big Endian                                              | Big Endian     |
| Compressed             |                                                                     |                |
| 1.2.840.10008.1.2.5    | RLE Lossless                                                        | RLE            |
| 1.2.840.10008.1.2.4.50 | JPEG Baseline lossy process 1 (8 bit)*                              | libJPEG-turbo  |
| 1.2.840.10008.1.2.4.51 | JPEG Baseline lossy process 2 & 4 (12 bit)                          | libJPEG-turbo  |
| 1.2.840.10008.1.2.4.57 | JPEG Lossless, Nonhierarchical (Processes 14)                       | ?              |
| 1.2.840.10008.1.2.4.70 | JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])         | ?              |
| 1.2.840.10008.1.2.4.80 | JPEG-LS Lossless Image Compression                                  | CharLS         |
| 1.2.840.10008.1.2.4.81 | JPEG-LS Lossy (Near-Lossless) Image Compression                     | CharLS         |
| 1.2.840.10008.1.2.4.90 | JPEG 2000 Image Compression (Lossless Only)                         | OpenJPEG       |
| 1.2.840.10008.1.2.4.91 | JPEG 2000 Image Compression                                         | OpenJPEG       |
| 1.2.840.10008.1.2.4.92 | JPEG 2000 Part 2 Multicomponent Image Compression (Lossless Only)** | OpenJPEG?      |
| 1.2.840.10008.1.2.4.93 | JPEG 2000 Part 2 Multicomponent Image Compression**                 | OpenJPEG?      |
| 1.2.840.10008.1.2.1.99 | Deflated Explicit VR Little Endian                                  | Little Endian  |

\* - 1.2.840.10008.1.2.4.50: 8-bit RGB can leverage the browser's built in decoder.
\*\* - 1.2.840.10008.1.2.4.\[92|93\]: Not supported in previous image loaders; OpenJPEG may work with these 

5: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/src/shared/decoders/decodeRLE.js)
57 & 70: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/codecs/jpegLossless.js)
1.2 & 2.1 & 99: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/src/shared/decoders/decodeLittleEndian.js)
2.2: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/src/shared/decoders/decodeBigEndian.js)



### Codec Package Anatomy

...