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
/// JavaScript API for decoding JPEG bistreams with libjpeg-turbo
/// </summary>
class JPEGDecoder {
  public: 
  /// <summary>
  /// Constructor for decoding a JPEG image from JavaScript.
  /// </summary>
  JPEGDecoder()
  {
  }

#ifdef __EMSCRIPTEN__
  /// <summary>
  /// Resizes encoded buffer and returns a TypedArray of the buffer allocated
  /// in WASM memory space that will hold the JPEG encoded bitstream.
  /// JavaScript code needs to copy the JPEG encoded bistream into the
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
#else
  /// <summary>
  /// Returns the buffer to store the encoded bytes.  This method is not exported
  /// to JavaScript, it is intended to be called by C++ code
  /// </summary>
  std::vector<uint8_t>& getEncodedBytes() {
      return encoded_;
  }

  /// <summary>
  /// Returns the buffer to store the decoded bytes.  This method is not exported
  /// to JavaScript, it is intended to be called by C++ code
  /// </summary>
  const std::vector<uint8_t>& getDecodedBytes() const {
      return decoded_;
  }
#endif
 
  /// <summary>
  /// Reads the header from an encoded JPEG bitstream.  The caller must have
  /// copied the JPEG encoded bitstream into the encoded buffer before 
  /// calling this method, see getEncodedBuffer() and getEncodedBytes() above.
  /// </summary>
  void readHeader() {
    tjhandle tjInstance = NULL;
    if ((tjInstance = tjInitDecompress()) == NULL) {
        throw("initializing decompressor\n");
    }
    
    if(readHeader_i(tjInstance) < 0) {
        tjDestroy(tjInstance);  tjInstance = NULL;
        throw("reading header");
    }

    tjDestroy(tjInstance);  tjInstance = NULL;
  }

  /// <summary>
  /// Decodes the encoded JPEG bitstream.  The caller must have copied the
  /// JPEG encoded bitstream into the encoded buffer before calling this
  /// method, see getEncodedBuffer() and getEncodedBytes() above.
  /// </summary>
  void decode() {
    tjhandle tjInstance = NULL;
    if ((tjInstance = tjInitDecompress()) == NULL) {
        throw("initializing decompressor\n");
    }
    
    if(readHeader_i(tjInstance)) {
        tjDestroy(tjInstance);
        throw("error reading header\n");
    }

    int pixelFormat = (frameInfo_.componentCount == 1) ? TJPF_GRAY : TJPF_RGB;

    const size_t destinationSize = frameInfo_.width * frameInfo_.height * tjPixelSize[pixelFormat];
    decoded_.resize(destinationSize);

    if (tjDecompress2(tjInstance, encoded_.data(), encoded_.size(), decoded_.data(), 
        frameInfo_.width, 0, frameInfo_.height, pixelFormat, 0) < 0) {
        tjDestroy(tjInstance);
        throw("~~decompressing JPEG image\n");
    }

    tjDestroy(tjInstance);
  }

  /// <summary>
  /// returns the FrameInfo object for the decoded image.
  /// </summary>
  const FrameInfo& getFrameInfo() const {
      return frameInfo_;
  }

  /// <summary>
  /// returns true if the image is lossless, false if lossy
  /// </summary>
  const bool getIsReversible() const {
      return isReversible_;
  }

  private:

    int readHeader_i(tjhandle tjInstance) {
        int width, height, inSubsamp, inColorspace;
        unsigned long jpegSize = (unsigned long)encoded_.size();

        if (tjDecompressHeader3(tjInstance, encoded_.data(), jpegSize, &width, &height,
                                &inSubsamp, &inColorspace) < 0) {
            return -1;
        }

        frameInfo_.width = width;
        frameInfo_.height = height;
        frameInfo_.bitsPerSample = 8;
        frameInfo_.isSigned = false;
        frameInfo_.componentCount = inColorspace == 2 ? 1 : 3;
        
        return 0;
    }

    std::vector<uint8_t> encoded_;
    std::vector<uint8_t> decoded_;
    FrameInfo frameInfo_;
    bool isReversible_;
};

