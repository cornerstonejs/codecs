// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#pragma once

#include "FrameInfo.hpp"
#include <vector>

#include "jxl/encode.h"
#include "jxl/encode_cxx.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

/// <summary>
/// JavaScript API for encoding images to JPEG-XL bitstreams
/// </summary>
class JpegXLEncoder {
  public: 
  /// <summary>
  /// Constructor for encoding a JPEG-XL image from JavaScript.  
  /// </summary>
  JpegXLEncoder() : effort_(4), progressive_(true), lossless_(true), distance_(0.0f) {
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
    return emscripten::val(emscripten::typed_memory_view(encoded_.size(), encoded_.data()));
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

  /// <summary>
  /// Sets encoder effort/speed level without affecting decoding speed. 
  /// Valid values are, from faster to slower speed: 
  ///  1:lightning 
  ///  2:thunder 
  ///  3:falcon (default)
  ///  4:cheetah 
  ///  5:hare 
  ///  6:wombat 
  ///  7:squirrel 
  ///  8:kitten 
  ///  9:tortoise
  /// </summary>
  void setEffort(int effort) {
    effort_ = effort;
  }

  /// <summary>
  /// Sets the progressive flag (default is off/false) 
  /// </summary>
  void setProgressive(bool progressive) {
    progressive_ = progressive;
  }

  /// <summary>
  /// Sets the quality (default is lossless)
  /// </summary>
  void setQuality(bool lossless, float distance) {
    lossless_ = lossless;
    distance_ = distance;
  }

  /// <summary>
  /// Executes an JPEG-XL encode using the data in the source buffer.  The
  /// JavaScript code must copy the source image frame into the source
  /// buffer before calling this method.  See documentation on getSourceBytes()
  /// above
  /// </summary>
  int encode() {
    auto enc = JxlEncoderMake(/*memory_manager=*/nullptr);
    
    JxlDataType dataType = frameInfo_.bitsPerSample <= 8 ? JXL_TYPE_UINT8 : JXL_TYPE_UINT16;
    JxlPixelFormat pixel_format = {frameInfo_.componentCount, dataType, JXL_NATIVE_ENDIAN, 0};

    JxlBasicInfo basic_info;
    JxlEncoderInitBasicInfo(&basic_info);
    basic_info.bits_per_sample = frameInfo_.bitsPerSample;
    basic_info.exponent_bits_per_sample = 0;
    basic_info.xsize = frameInfo_.width;
    basic_info.ysize = frameInfo_.height;
    basic_info.uses_original_profile = 1;
    if (JXL_ENC_SUCCESS != JxlEncoderSetBasicInfo(enc.get(), &basic_info)) {
      return -1;
    }

    if(frameInfo_.componentCount == 1) {
      // grayscale path
      JxlColorEncoding color_encoding = {};
      color_encoding.transfer_function = JXL_TRANSFER_FUNCTION_GAMMA;
      color_encoding.gamma = 0.454550;
      color_encoding.color_space = JXL_COLOR_SPACE_GRAY;
      color_encoding.rendering_intent = JXL_RENDERING_INTENT_RELATIVE;
      color_encoding.white_point = JXL_WHITE_POINT_D65;
      if (JXL_ENC_SUCCESS != JxlEncoderSetColorEncoding(enc.get(), &color_encoding)) {
        return -2;
      }
    } else {
      JxlColorEncoding color_encoding = {};
      JxlColorEncodingSetToSRGB(&color_encoding,
                                /*is_gray=*/pixel_format.num_channels < 3);
      if (JXL_ENC_SUCCESS !=
          JxlEncoderSetColorEncoding(enc.get(), &color_encoding)) {
        return -2;
      }
    }

    JxlEncoderOptions* options = JxlEncoderOptionsCreate(enc.get(), nullptr);
    JxlEncoderFrameSettingsSetOption(options, JXL_ENC_FRAME_SETTING_EFFORT, effort_);
    if(progressive_) {
      JxlEncoderFrameSettingsSetOption(options, JXL_ENC_FRAME_SETTING_RESPONSIVE, 1);
      JxlEncoderFrameSettingsSetOption(options, JXL_ENC_FRAME_SETTING_QPROGRESSIVE_AC, true);
    }
    JxlEncoderFrameSettingsSetOption(options, JXL_ENC_FRAME_SETTING_MODULAR_MA_TREE_LEARNING_PERCENT, 0);
    JxlEncoderFrameSettingsSetOption(options, JXL_ENC_FRAME_SETTING_MODULAR_GROUP_SIZE, 0);

    if(lossless_) {
      JxlEncoderOptionsSetLossless(options, true);
    } else {
      JxlEncoderOptionsSetDistance(options, distance_);
    }

    if (JXL_ENC_SUCCESS != JxlEncoderAddImageFrame(options,
                              &pixel_format, (void*)decoded_.data(),
                              decoded_.size())) {
      return -3;
    } 

    encoded_.resize(64);
    uint8_t* next_out = encoded_.data();
    size_t avail_out = encoded_.size() - (next_out - encoded_.data());
    JxlEncoderStatus process_result = JXL_ENC_NEED_MORE_OUTPUT;
    while (process_result == JXL_ENC_NEED_MORE_OUTPUT) {
      process_result = JxlEncoderProcessOutput(enc.get(), &next_out, &avail_out);
      if (process_result == JXL_ENC_NEED_MORE_OUTPUT) {
        size_t offset = next_out - encoded_.data();
        encoded_.resize(encoded_.size() * 2);
        next_out = encoded_.data() + offset;
        avail_out = encoded_.size() - offset;
      }
    }
    encoded_.resize(next_out - encoded_.data());
    return 0;
  }

  private:
    std::vector<uint8_t> decoded_;
    std::vector<uint8_t> encoded_;
    FrameInfo frameInfo_;
    int effort_;
    bool progressive_;
    bool lossless_;
    float distance_;
};
