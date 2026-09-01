#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <algorithm>
#include <cstdint>
#include <stdexcept>
#include <string>

#include <jxl/encode.h>
#include <jxl/types.h>

#include "frame_info.h"
#include "frame_size.h"
#include "raw_buffer.h"

using namespace emscripten;
using cornerstone_jxl::CheckedFrameSize;
using cornerstone_jxl::RawBuffer;

namespace {

// Frees the encoder however encode() leaves, including via throw.
class EncoderHandle {
 public:
  EncoderHandle() : enc_(JxlEncoderCreate(nullptr)) {
    if (!enc_) {
      throw std::runtime_error("JpegXLEncoder: failed to create encoder");
    }
  }
  ~EncoderHandle() {
    if (enc_) {
      JxlEncoderDestroy(enc_);
    }
  }
  EncoderHandle(const EncoderHandle&) = delete;
  EncoderHandle& operator=(const EncoderHandle&) = delete;

  JxlEncoder* get() const { return enc_; }

 private:
  JxlEncoder* enc_;
};

void check(JxlEncoder* enc, JxlEncoderStatus status, const char* what) {
  if (status != JXL_ENC_SUCCESS) {
    throw std::runtime_error(std::string("JpegXLEncoder: ") + what +
                             " failed (error " +
                             std::to_string(static_cast<int>(
                                 JxlEncoderGetError(enc))) +
                             ")");
  }
}

}  // namespace

class JpegXLEncoder {
 public:
  JpegXLEncoder() : frameInfo_{} {}

  /// Sizes the source buffer for `frameInfo` and returns a view of it in WASM
  /// memory for the caller to copy samples into. Must be called before
  /// encode(); the frame info is remembered until the next call.
  val getDecodedBuffer(const FrameInfo& frameInfo) {
    validate(frameInfo);
    frameInfo_ = frameInfo;
    decoded_.resize(CheckedFrameSize("JpegXLEncoder", frameInfo.width,
                                     frameInfo.height,
                                     frameInfo.componentCount,
                                     bytesPerSample(frameInfo)));
    return val(typed_memory_view(decoded_.size(), decoded_.data()));
  }

  /// A view of the encoded bitstream in WASM memory. Valid until the next
  /// encode() or releaseBuffers().
  val getEncodedBuffer() {
    return val(typed_memory_view(encoded_.size(), encoded_.data()));
  }

  const FrameInfo& getFrameInfo() const { return frameInfo_; }

  /// Mathematically lossless encoding (the default). Turning it off makes
  /// `distance` meaningful.
  void setLossless(bool lossless) { lossless_ = lossless; }

  /// Butteraugli distance for lossy encoding: 0 is lossless, 1 is visually
  /// lossless, up to 25. Ignored while setLossless(true) is in effect.
  void setDistance(float distance) {
    if (!(distance >= 0.0f) || distance > 25.0f) {
      throw std::runtime_error("JpegXLEncoder: distance must be 0..25");
    }
    distance_ = distance;
  }

  /// Encoder effort, 1 (fastest) to 9 (densest). 7 by default, matching cjxl.
  void setEffort(int effort) {
    if (effort < 1 || effort > 9) {
      throw std::runtime_error("JpegXLEncoder: effort must be 1..9");
    }
    effort_ = effort;
  }

  /// Trades compression density for decode speed: 0 (densest, the default) to
  /// 4 (fastest to decode). Worth raising for data that is read far more often
  /// than it is written.
  void setDecodingSpeed(int tier) {
    if (tier < 0 || tier > 4) {
      throw std::runtime_error("JpegXLEncoder: decoding speed must be 0..4");
    }
    decodingSpeed_ = tier;
  }

  /// Hands both buffers back to the allocator; they are otherwise kept at
  /// their high water mark so that encoding a series does not reallocate.
  void releaseBuffers() {
    decoded_.release();
    encoded_.release();
    frameInfo_ = {};
  }

  void encode() {
    validate(frameInfo_);
    const size_t sourceSize =
        CheckedFrameSize("JpegXLEncoder", frameInfo_.width, frameInfo_.height,
                         frameInfo_.componentCount, bytesPerSample(frameInfo_));
    if (decoded_.size() != sourceSize) {
      throw std::runtime_error(
          "JpegXLEncoder: call getDecodedBuffer() before encode()");
    }

    // Kept for the lifetime of this object and reset per frame - creating an
    // encoder allocates internal state that is not worth paying for once per
    // frame of a series. Reset clears the frame settings, so those are made
    // fresh below.
    JxlEncoder* enc = handle_.get();
    JxlEncoderReset(enc);

    const bool gray = frameInfo_.componentCount == 1;

    JxlBasicInfo basicInfo;
    JxlEncoderInitBasicInfo(&basicInfo);
    basicInfo.xsize = frameInfo_.width;
    basicInfo.ysize = frameInfo_.height;
    basicInfo.bits_per_sample = frameInfo_.bitsPerSample;
    basicInfo.exponent_bits_per_sample = 0;  // Integer samples
    basicInfo.uses_original_profile =
        lossless_ || gray ? JXL_TRUE : JXL_FALSE;
    basicInfo.num_color_channels = frameInfo_.componentCount;
    basicInfo.num_extra_channels = 0;
    basicInfo.alpha_bits = 0;
    check(enc, JxlEncoderSetBasicInfo(enc, &basicInfo),
          "JxlEncoderSetBasicInfo");

    // The colour encoding is metadata for the lossless path - modular with
    // uses_original_profile stores the integer samples verbatim - but it does
    // steer the lossy path, so it should describe the source rather than
    // assert one value for everything:
    //   - greyscale medical data holds raw intensities whose display is driven
    //     by the DICOM modality LUT and window, not by an embedded profile, so
    //     signal LINEAR;
    //   - DICOM RGB without an ICC profile is assumed to be sRGB display data.
    // libjxl rejects UNKNOWN here when uses_original_profile is set. RELATIVE
    // rendering intent suits measured data better than PERCEPTUAL.
    JxlColorEncoding colorEncoding = {};
    colorEncoding.color_space =
        gray ? JXL_COLOR_SPACE_GRAY : JXL_COLOR_SPACE_RGB;
    colorEncoding.white_point = JXL_WHITE_POINT_D65;
    colorEncoding.primaries = JXL_PRIMARIES_SRGB;  // ignored for greyscale
    colorEncoding.transfer_function =
        gray ? JXL_TRANSFER_FUNCTION_LINEAR : JXL_TRANSFER_FUNCTION_SRGB;
    colorEncoding.rendering_intent = JXL_RENDERING_INTENT_RELATIVE;
    check(enc, JxlEncoderSetColorEncoding(enc, &colorEncoding),
          "JxlEncoderSetColorEncoding");

    JxlEncoderFrameSettings* settings =
        JxlEncoderFrameSettingsCreate(enc, nullptr);
    if (!settings) {
      throw std::runtime_error("JpegXLEncoder: failed to create frame settings");
    }

    check(enc,
          JxlEncoderFrameSettingsSetOption(settings,
                                           JXL_ENC_FRAME_SETTING_EFFORT,
                                           effort_),
          "setting effort");
    check(enc,
          JxlEncoderFrameSettingsSetOption(settings,
                                           JXL_ENC_FRAME_SETTING_DECODING_SPEED,
                                           decodingSpeed_),
          "setting decoding speed");

    if (lossless_) {
      // Modular is what makes lossless integer coding cheap; VarDCT at
      // distance 0 would round trip exactly too, but far more slowly and
      // usually larger for this kind of data.
      check(enc, JxlEncoderSetFrameLossless(settings, JXL_TRUE),
            "JxlEncoderSetFrameLossless");
      check(enc, JxlEncoderSetFrameDistance(settings, 0.0f),
            "JxlEncoderSetFrameDistance");
      check(enc,
            JxlEncoderFrameSettingsSetOption(settings,
                                             JXL_ENC_FRAME_SETTING_MODULAR, 1),
            "selecting modular mode");
    } else {
      check(enc, JxlEncoderSetFrameLossless(settings, JXL_FALSE),
            "JxlEncoderSetFrameLossless");
      check(enc, JxlEncoderSetFrameDistance(settings, distance_),
            "JxlEncoderSetFrameDistance");
    }

    JxlPixelFormat pixelFormat = {};
    pixelFormat.num_channels = frameInfo_.componentCount;
    pixelFormat.data_type =
        frameInfo_.bitsPerSample <= 8 ? JXL_TYPE_UINT8 : JXL_TYPE_UINT16;
    pixelFormat.endianness = JXL_NATIVE_ENDIAN;
    pixelFormat.align = 0;

    // Read the samples at the depth the codestream declares instead of
    // normalising them against the full range of the buffer's type. Without
    // this a 12 bit sample in a uint16 buffer is divided by 65535 while the
    // header says 12 bits, and every conformant decoder then reproduces it
    // 16x too dark.
    JxlBitDepth bitDepth = {};
    bitDepth.type = JXL_BIT_DEPTH_FROM_CODESTREAM;
    check(enc, JxlEncoderSetFrameBitDepth(settings, &bitDepth),
          "JxlEncoderSetFrameBitDepth");

    check(enc,
          JxlEncoderAddImageFrame(settings, &pixelFormat, decoded_.data(),
                                  decoded_.size()),
          "JxlEncoderAddImageFrame");
    JxlEncoderCloseInput(enc);

    // Start at an eighth of the source, which comfortably covers a losslessly
    // compressed frame, and double from there. The capacity survives across
    // calls, so a series pays this at most once.
    encoded_.grow(std::max<size_t>(64u * 1024u, sourceSize / 8));

    size_t written = 0;
    for (;;) {
      uint8_t* nextOut = encoded_.data() + written;
      size_t availOut = encoded_.size() - written;
      const JxlEncoderStatus status =
          JxlEncoderProcessOutput(enc, &nextOut, &availOut);
      written = encoded_.size() - availOut;

      if (status == JXL_ENC_SUCCESS) {
        break;
      }
      if (status == JXL_ENC_NEED_MORE_OUTPUT) {
        encoded_.grow(encoded_.size() * 2);
        continue;
      }
      check(enc, status, "JxlEncoderProcessOutput");
    }

    // Trim to what was actually written; the capacity is kept.
    encoded_.grow(written);
  }

 private:
  static uint32_t bytesPerSample(const FrameInfo& info) {
    return info.bitsPerSample <= 8 ? 1 : 2;
  }

  static void validate(const FrameInfo& info) {
    if (info.componentCount != 1 && info.componentCount != 3) {
      throw std::runtime_error(
          "JpegXLEncoder: componentCount must be 1 or 3, got " +
          std::to_string(info.componentCount));
    }
    if (info.bitsPerSample < 1 || info.bitsPerSample > 16) {
      throw std::runtime_error("JpegXLEncoder: bitsPerSample must be 1..16, "
                               "got " +
                               std::to_string(info.bitsPerSample));
    }
    if (info.isSigned) {
      throw std::runtime_error(
          "JpegXLEncoder: signed samples must be offset into unsigned range "
          "by the caller");
    }
  }

  EncoderHandle handle_;
  RawBuffer decoded_;
  RawBuffer encoded_;
  FrameInfo frameInfo_;
  bool lossless_ = true;
  float distance_ = 0.0f;
  int effort_ = 7;
  int decodingSpeed_ = 0;
};

EMSCRIPTEN_BINDINGS(JpegXLEncoderBindings) {
  class_<JpegXLEncoder>("JpegXLEncoder")
      .constructor<>()
      .function("getDecodedBuffer", &JpegXLEncoder::getDecodedBuffer)
      .function("getEncodedBuffer", &JpegXLEncoder::getEncodedBuffer)
      .function("getFrameInfo", &JpegXLEncoder::getFrameInfo)
      .function("setLossless", &JpegXLEncoder::setLossless)
      .function("setDistance", &JpegXLEncoder::setDistance)
      .function("setEffort", &JpegXLEncoder::setEffort)
      .function("setDecodingSpeed", &JpegXLEncoder::setDecodingSpeed)
      .function("releaseBuffers", &JpegXLEncoder::releaseBuffers)
      .function("encode", &JpegXLEncoder::encode);
}
