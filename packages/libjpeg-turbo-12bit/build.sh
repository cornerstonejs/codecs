#!/bin/sh
# Disable exit on non 0
set +e
rm -rf build build-libjpeg dist
mkdir -p build build-libjpeg dist

# libjpeg-turbo 3.x forbids add_subdirectory() and dropped WITH_12BIT — a single
# build is now multi-precision (8/12/16-bit), exposing jpeg12_* APIs. So build
# libjpeg-turbo as a SEPARATE project first (Release, WITH_SIMD=0 for parity,
# WITH_SPNG=0 to avoid the new zlib/spng dep), then link its libjpeg.a; the
# 12-bit decoder uses jpeg12_read_scanlines.
echo "~~~ CONFIGURE libjpeg-turbo 3.x (standalone, multi-precision) ~~~"
(cd build-libjpeg && emcmake cmake -G"Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_SHARED=0 -DENABLE_STATIC=1 \
  -DWITH_SIMD=0 -DWITH_SPNG=0 \
  ../extern/libjpeg-turbo)
echo "~~~ MAKE libjpeg-turbo ~~~"
(cd build-libjpeg && emmake make VERBOSE=1 -j 16 jpeg-static)

echo "~~~ CONFIGURE wrapper ~~~"
LIBJPEG_TURBO_BUILD_DIR="$(cd build-libjpeg && pwd)"
(cd build && emcmake cmake -G"Unix Makefiles" -DLIBJPEG_TURBO_BUILD_DIR="$LIBJPEG_TURBO_BUILD_DIR" ..)
echo "~~~ MAKE wrapper ~~~"
(cd build && emmake make VERBOSE=1 -j 16)
echo "~~~ COPY ~~~ "
cp ./build/src/libjpegturbo12wasm.js ./dist
cp ./build/src/libjpegturbo12wasm.wasm ./dist
cp ./build/src/libjpegturbo12js.js.mem ./dist
cp ./build/src/libjpegturbo12js.js ./dist

echo "~~~ BUILD:"
(cd build && dir)
echo "~~~ DIST:"
(cd dist && dir)
node ../../tools/csp/check-generated-js.js ./dist
# echo "~~~ TEST:"
# (cd test/node; npm run test)
