// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT


#include "J2KDecoder.hpp"
#include "J2KEncoder.hpp"
#include "FrameInfo.hpp"
#include "Point.hpp"
#include "Size.hpp"

#include <emscripten.h>
#include <emscripten/bind.h>

using namespace emscripten;

static std::string getVersion() {
  std::string version = opj_version();
  return version;
}

EMSCRIPTEN_BINDINGS(charlsjs) {
    function("getVersion", &getVersion);
}
EMSCRIPTEN_BINDINGS(FrameInfo) {
  value_object<FrameInfo>("FrameInfo")
    .field("width", &FrameInfo::width)
    .field("height", &FrameInfo::height)
    .field("bitsPerSample", &FrameInfo::bitsPerSample)
    .field("componentCount", &FrameInfo::componentCount)
    .field("isSigned", &FrameInfo::isSigned)
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

EMSCRIPTEN_BINDINGS(J2KDecoder) {
  class_<J2KDecoder>("J2KDecoder")
    .constructor<>()
    .function("getEncodedBuffer", &J2KDecoder::getEncodedBuffer)
    .function("getDecodedBuffer", &J2KDecoder::getDecodedBuffer)
    .function("readHeader", &J2KDecoder::readHeader)
    .function("calculateSizeAtDecompositionLevel", &J2KDecoder::calculateSizeAtDecompositionLevel)
    .function("decode", &J2KDecoder::decode)
    .function("decodeSubResolution", &J2KDecoder::decodeSubResolution)
    .function("getFrameInfo", &J2KDecoder::getFrameInfo)
    .function("getNumDecompositions", &J2KDecoder::getNumDecompositions)
    .function("getIsReversible", &J2KDecoder::getIsReversible)
    .function("getProgressionOrder", &J2KDecoder::getProgressionOrder)
    .function("getImageOffset", &J2KDecoder::getImageOffset)
    .function("getTileSize", &J2KDecoder::getTileSize)
    .function("getTileOffset", &J2KDecoder::getTileOffset)
    .function("getBlockDimensions", &J2KDecoder::getBlockDimensions)
    .function("getNumLayers", &J2KDecoder::getNumLayers)
    .function("getColorSpace", &J2KDecoder::getColorSpace)
   ;
}


EMSCRIPTEN_BINDINGS(J2KEncoder) {
  class_<J2KEncoder>("J2KEncoder")
    .constructor<>()
    .function("getDecodedBuffer", &J2KEncoder::getDecodedBuffer)
    .function("getEncodedBuffer", &J2KEncoder::getEncodedBuffer)
    .function("encode", &J2KEncoder::encode)
    .function("setDecompositions", &J2KEncoder::setDecompositions)
    .function("setQuality", &J2KEncoder::setQuality)
    .function("setProgressionOrder", &J2KEncoder::setProgressionOrder)
    .function("setDownSample", &J2KEncoder::setDownSample)
    .function("setImageOffset", &J2KEncoder::setImageOffset)
    .function("setTileSize", &J2KEncoder::setTileSize)
    .function("setTileOffset", &J2KEncoder::setTileOffset)
    .function("setBlockDimensions", &J2KEncoder::setBlockDimensions)
    .function("setNumPrecincts", &J2KEncoder::setNumPrecincts)
    .function("setPrecinct", &J2KEncoder::setPrecinct)
    .function("setCompressionRatio", &J2KEncoder::setCompressionRatio)
    
   ;
}