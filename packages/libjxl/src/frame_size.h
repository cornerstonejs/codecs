#ifndef CORNERSTONE_CODEC_LIBJXL_FRAME_SIZE_H_
#define CORNERSTONE_CODEC_LIBJXL_FRAME_SIZE_H_

#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <string>

namespace cornerstone_jxl {

// Largest frame this module will allocate for, in bytes. Well above any DICOM
// frame (a 16 bit 8192x8192 mammogram is 128 MB) while staying inside what a
// 32 bit heap can actually hold alongside the decoder's own state.
constexpr uint64_t kMaxFrameBytes = 1024ull * 1024ull * 1024ull;

/// Returns width * height * channels * bytesPerSample, or throws if the
/// dimensions are absent or the product is beyond what can be allocated.
inline size_t CheckedFrameSize(const char* who, uint64_t width, uint64_t height,
                               uint64_t channels, uint64_t bytesPerSample) {
  if (width == 0 || height == 0 || channels == 0 || bytesPerSample == 0) {
    throw std::runtime_error(std::string(who) + ": empty frame (" +
                             std::to_string(width) + "x" +
                             std::to_string(height) + "x" +
                             std::to_string(channels) + ")");
  }

  uint64_t frameBytes = width;
  const auto multiply = [&](uint64_t factor) {
    if (frameBytes > kMaxFrameBytes / factor) {
      throw std::runtime_error(std::string(who) + ": frame of " +
                               std::to_string(width) + "x" +
                               std::to_string(height) +
                               " exceeds the supported size limit");
    }
    frameBytes *= factor;
  };
  multiply(height);
  multiply(channels);
  multiply(bytesPerSample);

  return static_cast<size_t>(frameBytes);
}

}  // namespace cornerstone_jxl

#endif  // CORNERSTONE_CODEC_LIBJXL_FRAME_SIZE_H_
