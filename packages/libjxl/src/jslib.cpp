// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

#include "JpegXLDecoder.hpp"
#include "JpegXLEncoder.hpp"

#include <emscripten.h>
#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(FrameInfo) {
  value_object<FrameInfo>("FrameInfo")
    .field("width", &FrameInfo::width)
    .field("height", &FrameInfo::height)
    .field("bitsPerSample", &FrameInfo::bitsPerSample)
    .field("componentCount", &FrameInfo::componentCount)
       ;
}

EMSCRIPTEN_BINDINGS(JpegXLDecoder) {
  class_<JpegXLDecoder>("JpegXLDecoder")
    .constructor<>()
    .function("getEncodedBuffer", &JpegXLDecoder::getEncodedBuffer)
    .function("getDecodedBuffer", &JpegXLDecoder::getDecodedBuffer)
    .function("decode", &JpegXLDecoder::decode)
    .function("getFrameInfo", &JpegXLDecoder::getFrameInfo)
   ;
}

EMSCRIPTEN_BINDINGS(JpegXLEncoder) {
  class_<JpegXLEncoder>("JpegXLEncoder")
    .constructor<>()
    .function("getDecodedBuffer", &JpegXLEncoder::getDecodedBuffer)
    .function("getEncodedBuffer", &JpegXLEncoder::getEncodedBuffer)
    .function("setEffort", &JpegXLEncoder::setEffort)
    .function("setQuality", &JpegXLEncoder::setQuality)
    .function("encode", &JpegXLEncoder::encode)
   ;
}