// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include "FrameInfo.hpp"
#include <vector>

#include "jxl/decode.h"
#include "jxl/decode_cxx.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

/// <summary>
/// JavaScript API for decoding JPEG-LS bistreams with CharLS
/// </summary>
class JpegXLDecoder {
  public: 
  /// <summary>
  /// Constructor for decoding a JPEG-LS image from JavaScript.
  /// </summary>
  JpegXLDecoder() {
  }

#ifdef __EMSCRIPTEN__
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
  /// Decodes the encoded JPEG-LS bitstream.  The caller must have copied the
  /// JPEG-LS encoded bitstream into the encoded buffer before calling this
  /// method, see getEncodedBuffer() above.
  /// </summary>
  int decode() {
    auto dec = JxlDecoderMake(nullptr);

    if (JXL_DEC_SUCCESS !=  JxlDecoderSubscribeEvents(dec.get(), JXL_DEC_BASIC_INFO |
                                               JXL_DEC_COLOR_ENCODING |
                                               JXL_DEC_FULL_IMAGE)) {
        return -1;
    }

    JxlPixelFormat format;
    JxlBasicInfo info;
    JxlDecoderSetInput(dec.get(), encoded_.data(), encoded_.size());

    std::vector<uint8_t> icc_profile;

    for (;;) {
        JxlDecoderStatus status = JxlDecoderProcessInput(dec.get());
        //printf("Status = %x\n", status);
        if (status == JXL_DEC_ERROR) {
            return -2;
        } else if (status == JXL_DEC_NEED_MORE_INPUT) {
            JxlDecoderFlushImage(dec.get());
            return -3;
        } else if (status == JXL_DEC_BASIC_INFO) {
            if (JXL_DEC_SUCCESS != JxlDecoderGetBasicInfo(dec.get(), &info)) {
                return -4;
            }
            frameInfo_.width = info.xsize;
            frameInfo_.height = info.ysize;
            frameInfo_.componentCount = info.num_color_channels;
            frameInfo_.bitsPerSample = info.bits_per_sample;
            JxlDataType dataType = frameInfo_.bitsPerSample <= 8 ? JXL_TYPE_UINT8 : JXL_TYPE_UINT16;
            format = {frameInfo_.componentCount, dataType, JXL_NATIVE_ENDIAN, 0};
        } else if (status == JXL_DEC_COLOR_ENCODING) {
            // Get the ICC color profile of the pixel data
            size_t icc_size;
            if (JXL_DEC_SUCCESS !=
                JxlDecoderGetICCProfileSize(
                    dec.get(), &format, JXL_COLOR_PROFILE_TARGET_DATA, &icc_size)) {
                return -5;
            }
            icc_profile.resize(icc_size);
            if (JXL_DEC_SUCCESS != JxlDecoderGetColorAsICCProfile(
                                 dec.get(), &format,
                                 JXL_COLOR_PROFILE_TARGET_DATA,
                                 icc_profile.data(), icc_profile.size())) {
                return -6;
            }
        } else if (status == JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
            size_t buffer_size;
            if (JXL_DEC_SUCCESS !=
                JxlDecoderImageOutBufferSize(dec.get(), &format, &buffer_size)) {
                return -7;
            }
            decoded_.resize(buffer_size);
            void* pixels_buffer = (void*)decoded_.data();
            size_t pixels_buffer_size = decoded_.size();
            if (JXL_DEC_SUCCESS != JxlDecoderSetImageOutBuffer(dec.get(), &format,
                                                            pixels_buffer,
                                                            pixels_buffer_size)) {
                return -9;
            }
        } else if (status == JXL_DEC_FULL_IMAGE) {
            // Nothing to do. Do not yet return. If the image is an animation, more
            // full frames may be decoded. This example only keeps the last one.
        } else if (status == JXL_DEC_SUCCESS) {
            // All decoding successfully finished.
            // It's not required to call JxlDecoderReleaseInput(dec.get()) here since
            // the decoder will be destroyed.
            return 0;
        } else {
            return -10;
        }
    }
    return 0;
  }

  /// <summary>
  /// returns the FrameInfo object for the decoded image.
  /// </summary>
  const FrameInfo& getFrameInfo() const {
      return frameInfo_;
  }

  private:
    std::vector<uint8_t> encoded_;
    std::vector<uint8_t> decoded_;
    FrameInfo frameInfo_;
};

