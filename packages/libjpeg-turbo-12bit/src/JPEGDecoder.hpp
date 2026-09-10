// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include <cstdint>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
// #include "config.h"
#include "jpeglib.h"

using namespace std;

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>

thread_local const emscripten::val Uint8ClampedArray = emscripten::val::global("Uint8ClampedArray");
thread_local const emscripten::val Uint16Array = emscripten::val::global("Uint16Array");

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
    // decoded_ holds one 12-bit grayscale sample per pixel in an int16_t
    // (values 0..4095). Copy it into a JS-owned Uint16Array so the result is
    // detached from WASM memory (see https://web.dev/webassembly-memory-debugging/).
    // NOTE: must be a 16-bit typed array — wrapping in Uint8ClampedArray would
    // run every sample through ToUint8Clamp and flatten anything above 255,
    // destroying the 12-bit output.
    emscripten::val js_result = Uint16Array.new_(emscripten::typed_memory_view(
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

    // The explicit jpeg_destroy_decompress calls on the throw paths below
    // covered every check but not decoded_.resize(), which can throw
    // std::bad_alloc for a large frame and leaked the whole decompress object
    // and its memory pools. A destructor covers that, and cannot be forgotten
    // when another early exit is added, so the explicit calls are gone and
    // this is now the single point of release.
    struct DecompressGuard {
      jpeg_decompress_struct& info;
      ~DecompressGuard() { jpeg_destroy_decompress(&info); }
    } guard{cinfo};

    jpeg_mem_src(&cinfo, encoded_.data(), encoded_.size());
    // Read the header. In libjpeg-turbo 3.x this is precision-agnostic.
    jpeg_read_header(&cinfo, TRUE);

    // This codec handles single-component (grayscale) 12-bit JPEGs only. Fail
    // closed on color input: forcing JCS_GRAYSCALE on a multi-component image
    // would silently drop chroma and mis-report componentCount=1.
    if (cinfo.num_components != 1) {
      throw std::runtime_error(
        "Unsupported 12-bit JPEG: expected 1 component (grayscale), got " +
        std::to_string(cinfo.num_components));
    }
    // libjpeg-turbo 3.x is multi-precision in a single build, so a stream's
    // precision is no longer implied by which library we linked; this codec
    // only supports 12-bit samples. Reject others rather than mis-decode.
    if (cinfo.data_precision != 12) {
      throw std::runtime_error(
        "Unsupported JPEG precision: expected 12-bit, got " +
        std::to_string(cinfo.data_precision));
    }

    // Decode as single-component grayscale: one 12-bit sample per pixel held
    // in a 16-bit-wide J12SAMPLE, not an 8-bit RGBA quad. This once forced a
    // 4-samples-per-pixel RGBA colorspace while the output buffer below was
    // sized for 1 sample/pixel, so libjpeg wrote ~2x past the end of it.
    cinfo.out_color_space = JCS_GRAYSCALE;
    jpeg_start_decompress(&cinfo);

    frameInfo_.width = cinfo.output_width;
    frameInfo_.height = cinfo.output_height;
    frameInfo_.bitsPerSample = 12;
    frameInfo_.componentCount = 1;

    // One 12-bit sample per pixel, stored in a 16-bit-wide J12SAMPLE (short),
    // so the sample count is just width * height. Overflow-checked and capped
    // at 512 MiB of samples so a malformed or adversarial header cannot
    // overflow the computation or force an unbounded allocation.
    constexpr uint64_t kMaxOutputSamples = 512ull * 1024ull * 1024ull;
    const uint64_t width64 = static_cast<uint64_t>(cinfo.output_width);
    const uint64_t height64 = static_cast<uint64_t>(cinfo.output_height);
    if (width64 == 0 || height64 == 0) {
      throw std::runtime_error("Invalid JPEG dimensions (zero width or height)");
    }
    uint64_t output_size64 = width64 * height64;
    if (output_size64 / width64 != height64 || output_size64 == 0 ||
        output_size64 > kMaxOutputSamples) {
      throw std::runtime_error("Decoded buffer size out of range");
    }
    const size_t output_size = static_cast<size_t>(output_size64);

    decoded_.resize(output_size);
    const size_t stride = static_cast<size_t>(cinfo.output_width);

    // 12-bit precision decodes through jpeg12_read_scanlines with a
    // J12SAMPARRAY (short-based) — the libjpeg-turbo 3.x per-precision API.
    // Under 2.x the library was compiled WITH_12BIT=1 and plain
    // jpeg_read_scanlines *was* the 12-bit entry point; 3.x carries all
    // precisions in one build, so the call has to name the precision.
    // decoded_ is std::vector<int16_t>, matching J12SAMPLE.
    while (cinfo.output_scanline < cinfo.output_height) {
      J12SAMPROW output_data =
        reinterpret_cast<J12SAMPROW>(&decoded_[stride * cinfo.output_scanline]);
      (void)jpeg12_read_scanlines(&cinfo, &output_data, 1);
    }
    jpeg_finish_decompress(&cinfo);
    // DecompressGuard releases the decompress object -- a good deal of memory
    // -- as this scope unwinds.
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

