#ifndef CORNERSTONE_CODEC_LIBJXL_FRAME_INFO_H_
#define CORNERSTONE_CODEC_LIBJXL_FRAME_INFO_H_

#include <cstdint>

struct FrameInfo {
  uint32_t width;
  uint32_t height;
  // Sample depth, BitsStored in DICOM terms: 1..16. Samples occupy one byte
  // each up to 8 bits and two bytes each above that, right aligned - a 12 bit
  // sample is a value in 0..4095, not one shifted up into the top of a uint16.
  uint32_t bitsPerSample;
  // Colour channels only: 1 (greyscale) or 3 (RGB). Alpha and extra channels
  // are neither decoded nor encoded.
  uint32_t componentCount;
  // JPEG XL has no signed integer samples. The decoder always reports false
  // and the caller applies PixelRepresentation from the data set; the encoder
  // rejects true, since offsetting into unsigned range is the caller's job.
  bool isSigned;
};

#endif  // CORNERSTONE_CODEC_LIBJXL_FRAME_INFO_H_
