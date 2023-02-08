// Copyright (c) Team CharLS.
// SPDX-License-Identifier: MIT

#include "JpegLSDecoder.hpp"
#include "JpegLSEncoder.hpp"

#include <emscripten.h>
#include <emscripten/bind.h>

using namespace emscripten;

static std::string getVersion() {
  std::string version = charls_get_version_string();
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
       ;
}

EMSCRIPTEN_BINDINGS(JpegLSDecoder) {
  class_<JpegLSDecoder>("JpegLSDecoder")
    .constructor<>()
    .function("getEncodedBuffer", &JpegLSDecoder::getEncodedBuffer)
    .function("getDecodedBuffer", &JpegLSDecoder::getDecodedBuffer)
    .function("decode", &JpegLSDecoder::decode)
    .function("getFrameInfo", &JpegLSDecoder::getFrameInfo)
    .function("getInterleaveMode", &JpegLSDecoder::getInterleaveMode)
    .function("getNearLossless", &JpegLSDecoder::getNearLossless)
   ;
}

EMSCRIPTEN_BINDINGS(JpegLSEncoder) {
  class_<JpegLSEncoder>("JpegLSEncoder")
    .constructor<>()
    .function("getDecodedBuffer", &JpegLSEncoder::getDecodedBuffer)
    .function("getEncodedBuffer", &JpegLSEncoder::getEncodedBuffer)
    .function("setNearLossless", &JpegLSEncoder::setNearLossless)
    .function("setInterleaveMode", &JpegLSEncoder::setInterleaveMode)
    .function("encode", &JpegLSEncoder::encode)
   ;
}
