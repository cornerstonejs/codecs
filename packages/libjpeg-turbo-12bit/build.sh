#!/bin/sh
# Disable exit on non 0
set +e
rm -rf dist
mkdir -p build
mkdir -p dist

# DEBUG CONFIGURE
#(cd build && emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..) &&

echo "~~~ CONFIGURE ~~~"
(cd build && emcmake cmake -G"Unix Makefiles" -DWITH_12BIT=1 -DWITH_JPEG7=0 -DWITH_JPEG8=0 -DCMAKE_BUILD_TYPE=Debug ..)
echo "~~~ MAKE ~~~"
(cd build && emmake make VERBOSE=1 -j 16)
echo "~~~ COPY ~~~ "
cp ./build/src/libjpegturbowasm.js ./dist
cp ./build/src/libjpegturbowasm.wasm ./dist
cp ./build/src/libjpegturbojs.js.mem ./dist
cp ./build/src/libjpegturbojs.js ./dist

echo "~~~ BUILD:"
(cd build && dir)
echo "~~~ DIST:"
(cd dist && dir)