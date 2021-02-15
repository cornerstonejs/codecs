# Performance Measurements

## Environment

* Intel i9-9900K, DDR4-2666 MHz RAM
* Ubuntu 19.10

## Test Images

* ftp://medical.nema.org/MEDICAL/Dicom/DataSets/WG04/compsamples_jpegls.tar

## Node.js 14.0.0

### Decode

* CT1.JLS - 6.38 ms
* CT2.JLS - 6.20 ms
* MG1.JLS - 421.32 ms

### Encode

* CT2 - 7.24 ms

## FireFox 75.0

### Decode

* CT1.JLS - 6.00 ms
* CT2.JLS - 6.00 ms
* MG1.JLS - 370.00 ms

## Google Chrome 81.0

### Decode

* CT1.JLS - 7.14 ms
* CT2.JLS - 7.19 ms
* MG1.JLS - 463.06 ms

## Native C++

* CT1.JLS - 3.38 ms
* CT2.JLS - 3.44 ms
* MG1.JLS - 227.22 ms

