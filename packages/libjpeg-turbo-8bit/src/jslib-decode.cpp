#include "JPEGDecoder.hpp"

#include <emscripten.h>
#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(FrameInfo) {
  value_object<FrameInfo>("FrameInfo")
    .field("width", &FrameInfo::width)
    .field("height", &FrameInfo::height)
    .field("bitsPerSample", &FrameInfo::bitsPerSample)
    .field("componentCount", &FrameInfo::componentCount)
    .field("isSigned", &FrameInfo::isSigned)
       ;
}

EMSCRIPTEN_BINDINGS(JPEGDecoder) {
  class_<JPEGDecoder>("JPEGDecoder")
    .constructor<>()
    .function("getEncodedBuffer", &JPEGDecoder::getEncodedBuffer)
    .function("getDecodedBuffer", &JPEGDecoder::getDecodedBuffer)
    .function("readHeader", &JPEGDecoder::readHeader)
    .function("decode", &JPEGDecoder::decode)
    .function("getFrameInfo", &JPEGDecoder::getFrameInfo)
   ;
}
