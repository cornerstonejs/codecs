#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <cstdint>
#include <stdexcept>
#include <string>

#include <jxl/cms.h>
#include <jxl/decode.h>
#include <jxl/types.h>

#include "frame_info.h"
#include "frame_size.h"
#include "raw_buffer.h"

using namespace emscripten;
using cornerstone_jxl::CheckedFrameSize;
using cornerstone_jxl::RawBuffer;

namespace {

// Frees the decoder however decode() leaves the loop, including via throw.
class DecoderHandle {
 public:
  DecoderHandle() : dec_(JxlDecoderCreate(nullptr)) {
    if (!dec_) {
      throw std::runtime_error("JpegXLDecoder: failed to create decoder");
    }
  }
  ~DecoderHandle() {
    if (dec_) {
      JxlDecoderDestroy(dec_);
    }
  }
  DecoderHandle(const DecoderHandle&) = delete;
  DecoderHandle& operator=(const DecoderHandle&) = delete;

  JxlDecoder* get() const { return dec_; }

 private:
  JxlDecoder* dec_;
};

void check(JxlDecoderStatus status, const char* what) {
  if (status != JXL_DEC_SUCCESS) {
    throw std::runtime_error(std::string("JpegXLDecoder: ") + what + " failed");
  }
}

// True when the stream's data is already in the colour space the samples are
// wanted in, so no conversion has to be requested.
bool IsSrgb(const JxlColorEncoding& e) {
  return e.color_space == JXL_COLOR_SPACE_RGB &&
         e.white_point == JXL_WHITE_POINT_D65 &&
         e.primaries == JXL_PRIMARIES_SRGB &&
         e.transfer_function == JXL_TRANSFER_FUNCTION_SRGB;
}

}  // namespace

class JpegXLDecoder {
 public:
  JpegXLDecoder() : frameInfo_{} {}

  /// Resizes the encoded buffer to `encodedSize` and returns a view of it in
  /// WASM memory for the caller to copy the bitstream into.
  val getEncodedBuffer(size_t encodedSize) {
    encoded_.resize(encodedSize);
    return val(typed_memory_view(encoded_.size(), encoded_.data()));
  }

  /// A view of the decoded samples. Interpret according to getFrameInfo():
  /// bitsPerSample <= 8 gives one byte per sample, otherwise two bytes per
  /// sample in native (little) endianness.
  val getDecodedBuffer() {
    return val(typed_memory_view(decoded_.size(), decoded_.data()));
  }

  const FrameInfo& getFrameInfo() const { return frameInfo_; }

  /// Hands both buffers back to the allocator. Both are otherwise kept at
  /// their high water mark so that decoding a series does not reallocate; call
  /// this when a worker is going idle. Any view returned earlier by
  /// getEncodedBuffer()/getDecodedBuffer() dangles afterwards.
  void releaseBuffers() {
    encoded_.release();
    decoded_.release();
    frameInfo_ = {};
  }

  void decode() {
    // The decoder is kept for the lifetime of this object and reset per frame:
    // creating one costs an allocation of libjxl's internal state, which is
    // not worth paying once per frame of a volume.
    JxlDecoder* dec = handle_.get();
    JxlDecoderReset(dec);

    check(JxlDecoderSetCms(dec, *JxlGetDefaultCms()), "JxlDecoderSetCms");
    check(JxlDecoderSubscribeEvents(dec, JXL_DEC_BASIC_INFO |
                                             JXL_DEC_COLOR_ENCODING |
                                             JXL_DEC_FULL_IMAGE),
          "JxlDecoderSubscribeEvents");
    // DICOM frames carry no spot colours; rendering them would only add work.
    check(JxlDecoderSetRenderSpotcolors(dec, JXL_FALSE),
          "JxlDecoderSetRenderSpotcolors");
    check(JxlDecoderSetInput(dec, encoded_.data(), encoded_.size()),
          "JxlDecoderSetInput");
    JxlDecoderCloseInput(dec);

    JxlPixelFormat pixelFormat = {};
    size_t frameSize = 0;
    frameInfo_ = {};

    for (;;) {
      const JxlDecoderStatus status = JxlDecoderProcessInput(dec);

      switch (status) {
        case JXL_DEC_BASIC_INFO: {
          JxlBasicInfo basicInfo;
          check(JxlDecoderGetBasicInfo(dec, &basicInfo),
                "JxlDecoderGetBasicInfo");

          // Neither of these can come out of a DICOM encoder, and both would
          // be silently mangled by the integer output path below (floats clamp
          // to [0,1]; anything past 16 bit truncates), so refuse them outright
          // rather than hand back wrong pixels.
          if (basicInfo.exponent_bits_per_sample != 0) {
            throw std::runtime_error(
                "JpegXLDecoder: floating point samples are not supported");
          }
          if (basicInfo.bits_per_sample == 0 ||
              basicInfo.bits_per_sample > 16) {
            throw std::runtime_error(
                "JpegXLDecoder: unsupported bit depth " +
                std::to_string(basicInfo.bits_per_sample));
          }
          if (basicInfo.num_color_channels != 1 &&
              basicInfo.num_color_channels != 3) {
            throw std::runtime_error(
                "JpegXLDecoder: unsupported colour channel count " +
                std::to_string(basicInfo.num_color_channels));
          }

          frameInfo_.width = basicInfo.xsize;
          frameInfo_.height = basicInfo.ysize;
          frameInfo_.bitsPerSample = basicInfo.bits_per_sample;
          frameInfo_.componentCount = basicInfo.num_color_channels;
          frameInfo_.isSigned = false;

          // Ask for the samples as-is: greyscale stays single channel and
          // anything deeper than 8 bit comes back as 16 bit rather than being
          // squashed into a byte.
          pixelFormat.num_channels = basicInfo.num_color_channels;
          pixelFormat.data_type = basicInfo.bits_per_sample <= 8
                                      ? JXL_TYPE_UINT8
                                      : JXL_TYPE_UINT16;
          pixelFormat.endianness = JXL_NATIVE_ENDIAN;
          pixelFormat.align = 0;

          // Checked here, in 64 bit, because size_t is 32 bit under wasm32 and
          // the dimensions come straight off the wire.
          frameSize = CheckedFrameSize(
              "JpegXLDecoder", basicInfo.xsize, basicInfo.ysize,
              basicInfo.num_color_channels,
              basicInfo.bits_per_sample <= 8 ? 1 : 2);
          break;
        }

        case JXL_DEC_COLOR_ENCODING: {
          // Multi-channel frames are resolved to sRGB so the samples handed
          // back are plain RGB whatever colour transform the stream used - but
          // only when that is not already what the data is in, since the
          // conversion is a full floating point pass over the frame.
          // Greyscale is left alone - remapping it would alter pixel values
          // that carry meaning (Hounsfield units and friends).
          if (frameInfo_.componentCount > 1) {
            JxlColorEncoding data = {};
            const bool known =
                JxlDecoderGetColorAsEncodedProfile(
                    dec, JXL_COLOR_PROFILE_TARGET_DATA, &data) ==
                JXL_DEC_SUCCESS;
            if (!known || !IsSrgb(data)) {
              JxlColorEncoding srgb = {};
              srgb.color_space = JXL_COLOR_SPACE_RGB;
              srgb.white_point = JXL_WHITE_POINT_D65;
              srgb.primaries = JXL_PRIMARIES_SRGB;
              srgb.transfer_function = JXL_TRANSFER_FUNCTION_SRGB;
              srgb.rendering_intent = JXL_RENDERING_INTENT_RELATIVE;
              check(JxlDecoderSetOutputColorProfile(dec, &srgb, nullptr, 0),
                    "JxlDecoderSetOutputColorProfile");
            }
          }
          break;
        }

        case JXL_DEC_NEED_IMAGE_OUT_BUFFER: {
          size_t bufferSize = 0;
          check(JxlDecoderImageOutBufferSize(dec, &pixelFormat, &bufferSize),
                "JxlDecoderImageOutBufferSize");
          if (bufferSize != frameSize) {
            throw std::runtime_error(
                "JpegXLDecoder: output size disagrees with the frame header");
          }

          decoded_.resize(bufferSize);
          check(JxlDecoderSetImageOutBuffer(dec, &pixelFormat, decoded_.data(),
                                            decoded_.size()),
                "JxlDecoderSetImageOutBuffer");

          // Scale the samples to the depth the codestream declares rather than
          // to the full range of the output type. Without this a 12 bit frame
          // asked for as UINT16 comes back multiplied by 65535/4095, which is
          // both wrong and not even an exact shift. This is what djxl does by
          // default, and the inverse of what cjxl does when reading 12 bit
          // input. Must be called after SetImageOutBuffer.
          JxlBitDepth bitDepth = {};
          bitDepth.type = JXL_BIT_DEPTH_FROM_CODESTREAM;
          check(JxlDecoderSetImageOutBitDepth(dec, &bitDepth),
                "JxlDecoderSetImageOutBitDepth");
          break;
        }

        case JXL_DEC_FULL_IMAGE:
          // Only the first frame of an animation is of interest; DICOM frames
          // are encoded one per bitstream. Returning here rather than carrying
          // on also stops a later frame overwriting the decoded samples.
          JxlDecoderReleaseInput(dec);
          return;

        case JXL_DEC_SUCCESS:
          // Reached without a full image: the codestream held no frame.
          throw std::runtime_error("JpegXLDecoder: no image in the bitstream");

        case JXL_DEC_ERROR:
          throw std::runtime_error("JpegXLDecoder: decoding failed");

        case JXL_DEC_NEED_MORE_INPUT:
          throw std::runtime_error("JpegXLDecoder: unexpected end of input");

        default:
          throw std::runtime_error(
              "JpegXLDecoder: unexpected decoder status " +
              std::to_string(static_cast<int>(status)));
      }
    }
  }

 private:
  DecoderHandle handle_;
  RawBuffer encoded_;
  RawBuffer decoded_;
  FrameInfo frameInfo_;
};

EMSCRIPTEN_BINDINGS(JpegXLDecoderBindings) {
  class_<JpegXLDecoder>("JpegXLDecoder")
      .constructor<>()
      .function("getEncodedBuffer", &JpegXLDecoder::getEncodedBuffer)
      .function("getDecodedBuffer", &JpegXLDecoder::getDecodedBuffer)
      .function("getFrameInfo", &JpegXLDecoder::getFrameInfo)
      .function("releaseBuffers", &JpegXLDecoder::releaseBuffers)
      .function("decode", &JpegXLDecoder::decode);
}
