// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include <memory>
#include <vector>
// #include "config.h"
#include "jpeglib.h"

using namespace std;

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>

thread_local const emscripten::val Uint8ClampedArray = emscripten::val::global("Uint8ClampedArray");

#endif

extern "C" {
  #include "cdjpeg.h"
}


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
    // Create a JavaScript-friendly result from the memory view
    // instead of relying on the consumer to detach it from WASM memory
    // See https://web.dev/webassembly-memory-debugging/
    emscripten::val js_result = Uint8ClampedArray.new_(emscripten::typed_memory_view(
      decoded_.size(), decoded_.data()
    ));
    
    return js_result;
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
  const std::vector<int16_t>& getDecodedBytes() const {
      return decoded_;
  }
#endif
 
  /// <summary>
  /// Decodes the encoded JPEG bitstream.  The caller must have copied the
  /// JPEG encoded bitstream into the encoded buffer before calling this
  /// method, see getEncodedBuffer() and getEncodedBytes() above.
  /// </summary>
  void decode() {
    // tjhandle tjInstance = NULL;
    // if ((tjInstance = tjInitDecompress()) == NULL) {
    //     throw("initializing decompressor\n");
    // }
    
    // if(readHeader_i(tjInstance)) {
    //     tjDestroy(tjInstance);
    //     throw("error reading header\n");
    // }

    // int pixelFormat = (frameInfo_.componentCount == 1) ? TJPF_GRAY : TJPF_RGB;

    // const size_t destinationSize = frameInfo_.width * frameInfo_.height * tjPixelSize[pixelFormat];
    // decoded_.resize(destinationSize);

    // if (tjDecompress2(tjInstance, encoded_.data(), encoded_.size(), decoded_.data(), 
    //     frameInfo_.width, 0, frameInfo_.height, pixelFormat, 0) < 0) {
    //     tjDestroy(tjInstance);
    //     throw("~~decompressing JPEG image\n");
    // }

    // tjDestroy(tjInstance);

    jpeg_decompress_struct cinfo;
    jpeg_error_mgr jerr;
    // Initialize the JPEG decompression object with default error handling.
    cinfo.err = jpeg_std_error(&jerr);
    jpeg_create_decompress(&cinfo);

    jpeg_mem_src(&cinfo, encoded_.data(), encoded_.size());
    // Read file header, set default decompression parameters
    jpeg_read_header(&cinfo, TRUE);
    // Force RGBA decoding, even for grayscale images
    cinfo.out_color_space = JCS_EXT_RGBA;
    jpeg_start_decompress(&cinfo);


    frameInfo_.width = cinfo.output_width;
    frameInfo_.height = cinfo.output_height;
    frameInfo_.bitsPerSample = 8;
    frameInfo_.componentCount = 1; //inColorspace == 2 ? 1 : 3;
    
    // Prepare output buffer
      // int pixelFormat = (frameInfo_.componentCount == 1) ? TJPF_GRAY : TJPF_RGB;

    // const size_t destinationSize = frameInfo_.width * frameInfo_.height * tjPixelSize[pixelFormat];
    int pixelFormat = 1;
    size_t output_size = cinfo.output_width * cinfo.output_height * pixelFormat;

    // std::vector<uint8_t> output_buffer(output_size);

    decoded_.resize(output_size);

    auto stride = cinfo.output_width * pixelFormat;

    // Process data
    while (cinfo.output_scanline < cinfo.output_height) {
      int16_t* output_data = &decoded_[stride * cinfo.output_scanline];
      (void)jpeg_read_scanlines(&cinfo, &output_data, 1);
    }
    jpeg_finish_decompress(&cinfo);

    // Step 7: release JPEG compression object

    // auto data = Uint8ClampedArray.new_(typed_memory_view(output_size, &output_buffer[0]));

    // This is an important step since it will release a good deal of memory.
    jpeg_destroy_decompress(&cinfo);
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
    std::vector<uint8_t> encoded_;
    std::vector<int16_t> decoded_;
    FrameInfo frameInfo_;
    bool isReversible_;
};

