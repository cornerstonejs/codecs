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

> ℹ List of DICOM Transfer syntaxes: [https://www.dicomlibrary.com/dicom/transfer-syntax/](https://www.dicomlibrary.com/dicom/transfer-syntax/). More on each transfer syntax, how they differ, and in which situations they excel can be found here: [https://www.medicalconnections.co.uk/kb/Transfer-Syntax](https://www.medicalconnections.co.uk/kb/Transfer-Syntax)

Transfer Syntax is the language used in DICOM to describe the DICOM file format and the network transfer methods. 3 main variables are contained in the Transfer Syntax:

- VR: Implicit/Explicit
- Endianism: Little-Endian/BigEndian
- Pixel Data Compression



| Transfer Syntax UID     | Transfer Syntax Name                                                | Codec          |
|-------------------------|---------------------------------------------------------------------|----------------|
| Uncompressed            |                                                                     |                |
| 1.2.840.10008.1.2       | Implicit VR Little Endian: Default DICOM Transfer Syntax            | Little Endian  |
| 1.2.840.10008.1.2.1     | Explicit VR Little Endian                                           | Little Endian  |
| 1.2.840.10008.1.2.2     | Explicit VR Big Endian                                              | Big Endian     |
| Lossless Compressed     |                                                                     |                |
| 1.2.840.10008.1.2.4.57  | JPEG Lossless, Nonhierarchical (Processes 14)                       | ?              |
| 1.2.840.10008.1.2.4.70  | JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])         | ?              |
| 1.2.840.10008.1.2.4.80  | JPEG-LS Lossless Image Compression                                  | CharLS         |
| 1.2.840.10008.1.2.4.90  | JPEG 2000 Image Compression (Lossless Only)                         | OpenJPEG       |
| 1.2.840.10008.1.2.5     | RLE Lossless                                                        | RLE            |
| Lossy Compressed        |                                                                     |                |
| 1.2.840.10008.1.2.4.50  | JPEG Baseline lossy process 1 (8 bit)*                              | libJPEG-turbo  |
| 1.2.840.10008.1.2.4.51  | JPEG Baseline lossy process 2 & 4 (12 bit)                          | libJPEG-turbo  |
| 1.2.840.10008.1.2.4.81  | JPEG-LS Lossy (Near-Lossless) Image Compression                     | CharLS         |
| 1.2.840.10008.1.2.4.91  | JPEG 2000 Image Compression                                         | OpenJPEG       |
| 1.2.840.10008.1.2.4.92  | JPEG 2000 Part 2 Multicomponent Image Compression (Lossless Only)** | OpenJPEG?      |
| 1.2.840.10008.1.2.4.93  | JPEG 2000 Part 2 Multicomponent Image Compression**                 | OpenJPEG?      |
| MPEG                    |                                                                     |                |
| 1.2.840.10008.1.2.4.100 | MPEG-2                                                              | Not supported  |
| 1.2.840.10008.1.2.4.101 | MPEG-2                                                              | Not supported  |
| 1.2.840.10008.1.2.4.102 | MPEG-4                                                              | Not supported  |
| 1.2.840.10008.1.2.4.103 | MPEG-4                                                              | Not supported  |
| Special                 |                                                                     |                |
| 1.2.840.10008.1.2.4.94  | JPIP                                                                | Not supported  |
| 1.2.840.10008.1.2.4.95  | JPIP-Deflate                                                        | Not supported  |
| 1.2.840.10008.1.2.1.99  | Deflated Explicit VR Little Endian ***                              | Little Endian  |

- \* - 1.2.840.10008.1.2.4.50: 8-bit RGB can leverage the browser's built in decoder.
- \*\* - 1.2.840.10008.1.2.4.\[92|93\]: Not supported in previous image loaders; OpenJPEG may work with these
- \*\*\* - Unlike all other DICOM transfer syntaxes, the deflate transfer syntaxes compress the whole of the DICOM data (tags, lengths, VR etc.) rather than just the pixel data - this is done using the standard “deflate” mechanism as used in gzip etc.) It is therefore most suitable for non-pixel objects such as structured reports, presentation states etc.

- 5: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/src/shared/decoders/decodeRLE.js)
- 57 & 70: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/codecs/jpegLossless.js)
- 1.2 & 2.1 & 99: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/src/shared/decoders/decodeLittleEndian.js)
- 2.2: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/src/shared/decoders/decodeBigEndian.js)



### CI

We are leveraging `lerna` to version and publish packages. Lerna adds tooling on top of `yarn workspaces` to enable monorepo functionality. Our lerna configuration/usage is confined to:

- `package.json`
- `lerna.json`
- `.circleci/config.yml`

Pull requests attempt to build and test packages that have been modified (when compared against the `main` branch). "Semantic commit" messages, and the files included in the commit, help `lerna` determine how package versions should be updated and what to include in changelogs. Example commit messages include:

- `fix(charls-decode): should not break when no config option is provided`
- `feat(encode): add encode API method`
- `feat(encode): friendlier API method BREAKING_CHANGE`

You can read more about the specific lerna features we're using here:

- `lerna run <cmd>`: Used in `package.json`
- `lerna version`: Used in `.circleci/config.yml`
- `lerna publish`: Used in `.circleci/config.yml`
- ["Lerna filter options"][lerna-filter-options]: Used in `package.json` (--since main)

You can read more about semantic commit messages here:

- Semantic commits



### Codec Package Anatomy

...

<!--
    LINKS
-->


[lerna-filter-options]: https://github.com/lerna/lerna/tree/main/core/filter-options