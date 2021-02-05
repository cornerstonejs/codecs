// Copyright (c) Team CharLS.
// SPDX-License-Identifier: MIT

#pragma once

#include <charls/charls.h>

#include <emscripten/val.h>

#include "FrameInfo.hpp"

/// <summary>
/// JavaScript API for encoding images to JPEG-LS bistreams with CharLS
/// </summary>
class JpegLSEncoder {
  public: 
  /// <summary>
  /// Constructor for encoding a JPEG-LS image from JavaScript.  
  /// </summary>
  JpegLSEncoder() : 
    interleaveMode_(charls::interleave_mode::none),
    nearLossless_(0) {
  }

  /// <summary>
  /// Resizes the decoded buffer to accomodate the specified frameInfo.
  /// Returns a TypedArray of the buffer allocated in WASM memory space that
  /// will hold the pixel data to be encoded.  JavaScript code needs
  /// to copy the pixel data into the returned TypedArray.  This copy
  /// operation is needed because WASM runs in a sandbox and cannot access 
  /// data managed by JavaScript
  /// </summary>
  /// <param name="frameInfo">FrameInfo that describes the pixel data to be encoded</param>
  /// <returns>
  /// TypedArray for the buffer allocated in WASM memory space for the 
  /// source pixel data to be encoded.
  /// </returns>
  emscripten::val getDecodedBuffer(const FrameInfo& frameInfo) {
    frameInfo_ = frameInfo;
    const size_t bytesPerPixel = (frameInfo_.bitsPerSample + 8 - 1) / 8;
    const size_t decodedSize = frameInfo_.width * frameInfo_.height * frameInfo_.componentCount * bytesPerPixel;
    decoded_.resize(decodedSize);
    return emscripten::val(emscripten::typed_memory_view(decoded_.size(), decoded_.data()));
  }
  
  /// <summary>
  /// Returns a TypedArray of the buffer allocated in WASM memory space that
  /// holds the encoded pixel data.
  /// </summary>
  /// <returns>
  /// TypedArray for the buffer allocated in WASM memory space for the 
  /// encoded pixel data.
  /// </returns>
  emscripten::val getEncodedBuffer() {
    return emscripten::val(emscripten::typed_memory_view(encoded_.size(), encoded_.data()));
  }

  /// <summary>
  /// Sets the NEAR parameter for the encoding.  The default value is 0 which
  /// is lossless.
  /// </summary>
  void setNearLossless(int32_t nearLossless) {
    nearLossless_ = nearLossless;
  }

  /// <summary>
  /// Sets the interleave mode for the encoding.  The default value is 0 which
  /// is planar (RRRGGGBBB)
  /// </summary>
  void setInterleaveMode(uint8_t interleaveMode) {
    interleaveMode_ = (charls::interleave_mode)interleaveMode;
  }

  /// <summary>
  /// Executes an JPEG-LS encode using the data in the source buffer.  The
  /// JavaScript code must copy the source image frame into the source
  /// buffer before calling this method.  See documentation on getSourceBytes()
  /// above
  /// </summary>
  void encode() {
        charls::jpegls_encoder encoder;
        encoder.near_lossless(nearLossless_);
        encoder.frame_info({frameInfo_.width, frameInfo_.height, frameInfo_.bitsPerSample, frameInfo_.componentCount})
            .interleave_mode(interleaveMode_);

        encoded_.resize(encoder.estimated_destination_size());
        encoder.destination(encoded_);

        const size_t bytes_written{encoder.encode(decoded_)};
        encoded_.resize(bytes_written);
  }

  private:
    std::vector<uint8_t> decoded_;
    std::vector<uint8_t> encoded_;
    FrameInfo frameInfo_;
    charls::interleave_mode interleaveMode_;
    int32_t nearLossless_;
};
