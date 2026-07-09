#!/bin/sh
# Disable exit on non 0
set +e
rm -rf build build-libjpeg
mkdir -p build build-libjpeg dist

# libjpeg-turbo 3.x forbids add_subdirectory() integration (its CMake asserts
# it is the top-level project). So we build it as a SEPARATE project first,
# then link the produced static lib (libturbojpeg.a) into our wasm wrapper.
# WITH_SIMD=0 keeps parity with the previous build; WITH_SPNG=0 avoids the new
# 3.x zlib/spng dependency (only used by the tj* tools, not our decode/encode).
echo "~~~ CONFIGURE libjpeg-turbo 3.x (standalone) ~~~"
(cd build-libjpeg && emcmake cmake -G"Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_SHARED=0 -DENABLE_STATIC=1 \
  -DWITH_SIMD=0 -DWITH_SPNG=0 -DWITH_TURBOJPEG=1 \
  ../extern/libjpeg-turbo)
echo "~~~ MAKE libjpeg-turbo ~~~"
(cd build-libjpeg && emmake make VERBOSE=1 -j 16 turbojpeg-static jpeg-static)

echo "~~~ CONFIGURE wrapper ~~~"
LIBJPEG_TURBO_BUILD_DIR="$(cd build-libjpeg && pwd)"
(cd build && emcmake cmake -G"Unix Makefiles" -DLIBJPEG_TURBO_BUILD_DIR="$LIBJPEG_TURBO_BUILD_DIR" ..)
echo "~~~ MAKE wrapper ~~~"
(cd build && emmake make VERBOSE=1 -j 16)
echo "~~~ COPY ~~~ "
cp ./build/src/libjpegturbowasm.js ./dist
cp ./build/src/libjpegturbowasm.wasm ./dist
cp ./build/src/libjpegturbojs.js.mem ./dist
cp ./build/src/libjpegturbojs.js ./dist

cp ./build/src/libjpegturbowasm_decode.js ./dist
cp ./build/src/libjpegturbowasm_decode.wasm ./dist
cp ./build/src/libjpegturbojs_decode.js.mem ./dist
cp ./build/src/libjpegturbojs_decode.js ./dist

echo "~~~ BUILD:"
(cd build && dir)
echo "~~~ DIST:"
(cd dist && dir)
echo "~~~ TEST:"
(cd test/node; npm run test)
