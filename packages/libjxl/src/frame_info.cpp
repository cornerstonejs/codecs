#include "frame_info.h"

#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(JpegXLFrameInfoBindings) {
  value_object<FrameInfo>("FrameInfo")
      .field("width", &FrameInfo::width)
      .field("height", &FrameInfo::height)
      .field("bitsPerSample", &FrameInfo::bitsPerSample)
      .field("componentCount", &FrameInfo::componentCount)
      .field("isSigned", &FrameInfo::isSigned);
}
