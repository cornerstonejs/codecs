// Copyright (c) Team CharLS.
// SPDX-License-Identifier: MIT

#pragma once

#include <charls/charls.h>

#include <emscripten/val.h>

#include "FrameInfo.hpp"

/// <summary>
/// JavaScript API for decoding JPEG-LS bistreams with CharLS
/// </summary>
class JpegLSDecoder {
  public: 
  /// <summary>
  /// Constructor for decoding a JPEG-LS image from JavaScript.
  /// </summary>
  JpegLSDecoder() {
  }

  /// <summary>
  /// Resizes encoded buffer and returns a TypedArray of the buffer allocated
  /// in WASM memory space that will hold the JPEG-LS encoded bitstream.
  /// JavaScript code needs to copy the JPEG-LS encoded bistream into the
  /// returned TypedArray.  This copy operation is needed because WASM runs
  /// in a sandbox and cannot access memory managed by JavaScript.
  /// </summary>
  emscripten::val getEncodedBuffer(size_t encodedSize) {
    encoded_.resize(encodedSize);
    return emscripten::val(emscripten::typed_memory_view(encoded_.size(), encoded_.data()));
  }
  
  /// <summary>
  /// Returns a TypedArray of the buffer allocated in WASM memory space that
  /// holds the decoded pixel data
  /// </summary>
  emscripten::val getDecodedBuffer() {
    return emscripten::val(emscripten::typed_memory_view(decoded_.size(), decoded_.data()));
  }

  /// <summary>
  /// Decodes the encoded JPEG-LS bitstream.  The caller must have copied the
  /// JPEG-LS encoded bitstream into the encoded buffer before calling this
  /// method, see getEncodedBuffer() above.
  /// </summary>
  void decode() {
    charls::jpegls_decoder decoder;
    decoder.source(encoded_);
    
    decoder.read_header();

    nearLossless_ = decoder.near_lossless();
    interleaveMode_ = decoder.interleave_mode();
    charls::frame_info frameInfo = decoder.frame_info();
    frameInfo_.width = frameInfo.width;
    frameInfo_.height = frameInfo.height;
    frameInfo_.bitsPerSample = frameInfo.bits_per_sample;
    frameInfo_.componentCount = frameInfo.component_count;

    const size_t destination_size{decoder.destination_size()};
    decoded_.resize(destination_size);

    decoder.decode(decoded_);
  }

  /// <summary>
  /// returns the FrameInfo object for the decoded image.
  /// </summary>
  const FrameInfo& getFrameInfo() const {
      return frameInfo_;
  }

  /// <summary>
  /// returns the interleave mode for color images:
  ///  0 - planar (RRRGGGBBB)
  ///  1 - line (RGBRGBRGB)
  ///  2 - pixel (RGBRGBRGB)
  /// </summary>
  uint8_t getInterleaveMode() const {
    return static_cast<uint8_t>(interleaveMode_);
  }

  /// <summary>
  /// returns the NEAR parameter.  0 is lossless, > 0 is lossy
  /// </summary>
  int32_t getNearLossless() const {
    return nearLossless_;
  }

  private:
    std::vector<uint8_t> encoded_;
    std::vector<uint8_t> decoded_;
    FrameInfo frameInfo_;
    charls::interleave_mode interleaveMode_;
    int32_t nearLossless_;
};

