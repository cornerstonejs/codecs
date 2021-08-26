// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include <memory>
#include <turbojpeg.h>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>

#endif

#include "FrameInfo.hpp"

/// <summary>
/// JavaScript API for encoding images to JPEG bitstreams with libjpeg-turbo
/// </summary>
class JPEGEncoder {
  public: 
  /// <summary>
  /// Constructor for encoding a JPEG image from JavaScript.  
  /// </summary>
  JPEGEncoder() :
    progressive_(1),
    quality_(95),
    subSampling_(TJSAMP_444)
  {
  }

#ifdef __EMSCRIPTEN__
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
    // Create a JavaScript-friendly result from the memory view
    // instead of relying on the consumer to detach it from WASM memory
    // See https://web.dev/webassembly-memory-debugging/
    emscripten::val js_result = Uint8ClampedArray.new_(emscripten::typed_memory_view(
      encoded_.size(), encoded_.data()
    ));
    
    return js_result;
  }
#else
  /// <summary>
  /// Returns the buffer to store the decoded bytes.  This method is not
  /// exported to JavaScript, it is intended to be called by C++ code
  /// </summary>
 std::vector<uint8_t>& getDecodedBytes(const FrameInfo& frameInfo) {
    frameInfo_ = frameInfo;
    return decoded_;
  }

  /// <summary>
  /// Returns the buffer to store the encoded bytes.  This method is not
  /// exported to JavaScript, it is intended to be called by C++ code
  /// </summary>
  const std::vector<uint8_t>& getEncodedBytes() const {
    return encoded_;
  }
#endif

  void setProgressive(int progressive) {
      progressive_ = progressive;
  }

  // 1-100 with 1 = smallest size/lowest quality, 100 = largest size/highest quality
  void setQuality(int quality) {
      quality_ = quality;
  }

    // only applied for color images
  void setSubSampling(int subSampling) {
      subSampling_ = subSampling;
  }

  /// <summary>
  /// Executes an JPEG encode using the data in the source buffer.  The
  /// JavaScript code must copy the source image frame into the source
  /// buffer before calling this method.  See documentation on getSourceBytes()
  /// above
  /// </summary>
  void encode() {
    // HACK: presize the encoded buffer to the decoded size to make sure we have
    // enough space for the resulting image
    encoded_.resize(decoded_.size());
    tjhandle tjInstance = NULL;
    if ((tjInstance = tjInitCompress()) == NULL) {
        throw("initializing compressor");
    }

    int pixelFormat = frameInfo_.componentCount == 1 ? TJPF_GRAY : TJPF_RGB;
    int outSubsamp = frameInfo_.componentCount == 1 ? TJSAMP_GRAY : subSampling_;
    int flags = 0;
    unsigned char* jpegBuf = NULL;
    unsigned long jpegSize = 0;

    if(progressive_) {
        flags |= TJFLAG_PROGRESSIVE;
    }

    flags |= TJFLAG_NOREALLOC;
    jpegBuf = encoded_.data();
    jpegSize = encoded_.size();

    if (tjCompress2(tjInstance, decoded_.data(), frameInfo_.width, 0, frameInfo_.height, pixelFormat,
                    &jpegBuf, &jpegSize, outSubsamp, quality_, flags) < 0) {
      throw("compressing image");
    }

    encoded_.resize(jpegSize);

    tjDestroy(tjInstance);  tjInstance = NULL;
  }

  private:
    std::vector<uint8_t> decoded_;
    std::vector<uint8_t> encoded_;

    FrameInfo frameInfo_;
    int progressive_;
    int quality_;
    int subSampling_;
};
