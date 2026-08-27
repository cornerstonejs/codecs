// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#include "HTJ2KDecoder.hpp"
#include "HTJ2KEncoder.hpp"

#include <emscripten.h>
#include <emscripten/bind.h>

using namespace emscripten;

char buf[] = ""
  OJPH_INT_TO_STRING(OPENJPH_VERSION_MAJOR) "."
  OJPH_INT_TO_STRING(OPENJPH_VERSION_MINOR) "."
  OJPH_INT_TO_STRING(OPENJPH_VERSION_PATCH);

namespace ojph {
  bool init_cpu_ext_level(int& level);
}

// OpenJPH's INFO messages are developer chatter rather than consumer signal,
// and they go to STDOUT, so emscripten forwards them to console.log:
//
//   - HTJ2KDecoder's constructor emits "v06 HTJ2K Decoder" on EVERY
//     construction. A consumer decoding a series got one line per frame.
//   - Resilient decoding of a truncated codestream adds "File terminated
//     early" per decode, and with streaming support that is the NORMAL case,
//     not an anomaly.
//
// Raising the threshold to WARN drops both while leaving warnings and errors
// intact -- including HTJ2KDecoder's own decode diagnostics, which are
// OJPH_WARN precisely so they survive this.
//
// This replaces the two source patches the cornerstonejs OpenJPH fork used to
// carry (the `resilient` default and a commented-out OJPH_INFO); the fork now
// tracks upstream with zero delta. See cornerstonejs/OpenJPH#6.
//
// Static initialiser so the level is set before any binding below can run.
static const bool kOjphMessageLevelConfigured = []() {
  ojph::set_message_level(ojph::OJPH_MSG_WARN);
  return true;
}();

static std::string getVersion() {
  std::string version = buf;
  return version;
}

static unsigned int getSIMDLevel() {
  int level = 0;
  ojph::init_cpu_ext_level(level);
  return level;
}


EMSCRIPTEN_BINDINGS(charlsjs) {
    function("getVersion", &getVersion);
    function("getSIMDLevel", &getSIMDLevel);
}

EMSCRIPTEN_BINDINGS(FrameInfo) {
  value_object<FrameInfo>("FrameInfo")
    .field("width", &FrameInfo::width)
    .field("height", &FrameInfo::height)
    .field("bitsPerSample", &FrameInfo::bitsPerSample)
    .field("componentCount", &FrameInfo::componentCount)
    .field("isSigned", &FrameInfo::isSigned)
    .field("isUsingColorTransform", &FrameInfo::isUsingColorTransform)
       ;
}

EMSCRIPTEN_BINDINGS(Point) {
  value_object<Point>("Point")
    .field("x", &Point::x)
    .field("y", &Point::y)
       ;
}

EMSCRIPTEN_BINDINGS(Size) {
  value_object<Size>("Size")
    .field("width", &Size::width)
    .field("height", &Size::height)
       ;
}

EMSCRIPTEN_BINDINGS(HTJ2KDecoder) {
  class_<HTJ2KDecoder>("HTJ2KDecoder")
    .constructor<>()
    .function("getEncodedBuffer", &HTJ2KDecoder::getEncodedBuffer)
    .function("getDecodedBuffer", &HTJ2KDecoder::getDecodedBuffer)
    .function("readHeader", &HTJ2KDecoder::readHeader)
    .function("calculateSizeAtDecompositionLevel", &HTJ2KDecoder::calculateSizeAtDecompositionLevel)
    .function("decode", &HTJ2KDecoder::decode)
    .function("decodeSubResolution", &HTJ2KDecoder::decodeSubResolution)
    .function("getFrameInfo", &HTJ2KDecoder::getFrameInfo)
    // decode()/readHeader() report failure by returning normally with these set
    // rather than throwing, because a truncated codestream is a normal input for
    // streaming HTJ2K. Callers MUST check them; the OJPH_WARN that accompanies a
    // failure goes to stdout and is a diagnostic, not the signal.
    .function("getIsHeaderValid", &HTJ2KDecoder::getIsHeaderValid)
    .function("getLastErrorMessage", &HTJ2KDecoder::getLastErrorMessage)
    .function("getDownSample", &HTJ2KDecoder::getDownSample)
    .function("getNumDecompositions", &HTJ2KDecoder::getNumDecompositions)
    .function("getIsReversible", &HTJ2KDecoder::getIsReversible)
    .function("getProgressionOrder", &HTJ2KDecoder::getProgressionOrder)
    .function("getImageOffset", &HTJ2KDecoder::getImageOffset)
    .function("getTileSize", &HTJ2KDecoder::getTileSize)
    .function("getTileOffset", &HTJ2KDecoder::getTileOffset)
    .function("getBlockDimensions", &HTJ2KDecoder::getBlockDimensions)
    .function("getPrecinct", &HTJ2KDecoder::getPrecinct)
    .function("getNumLayers", &HTJ2KDecoder::getNumLayers)
   ;
}

EMSCRIPTEN_BINDINGS(HTJ2KEncoder) {
  class_<HTJ2KEncoder>("HTJ2KEncoder")
    .constructor<>()
    .function("getDecodedBuffer", &HTJ2KEncoder::getDecodedBuffer)
    .function("getEncodedBuffer", &HTJ2KEncoder::getEncodedBuffer)
    .function("encode", &HTJ2KEncoder::encode)
    .function("setDecompositions", &HTJ2KEncoder::setDecompositions)
    .function("setTLMMarker", &HTJ2KEncoder::setTLMMarker)
    .function("setTilePartDivisionsAtResolutions", &HTJ2KEncoder::setTilePartDivisionsAtResolutions)
    .function("setTilePartDivisionsAtComponents", &HTJ2KEncoder::setTilePartDivisionsAtComponents)
    .function("setQuality", &HTJ2KEncoder::setQuality)
    .function("setProgressionOrder", &HTJ2KEncoder::setProgressionOrder)
    .function("setDownSample", &HTJ2KEncoder::setDownSample)
    .function("setImageOffset", &HTJ2KEncoder::setImageOffset)
    .function("setTileSize", &HTJ2KEncoder::setTileSize)
    .function("setTileOffset", &HTJ2KEncoder::setTileOffset)
    .function("setBlockDimensions", &HTJ2KEncoder::setBlockDimensions)
    .function("setNumPrecincts", &HTJ2KEncoder::setNumPrecincts)
    .function("setPrecinct", &HTJ2KEncoder::setPrecinct)
   ;
}