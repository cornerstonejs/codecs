#!/bin/sh
# Disable exit on non 0
set +e
rm -rf dist
mkdir -p build
mkdir -p dist

# DEBUG CONFIGURE
#(cd build && emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..) &&

echo "~~~ CONFIGURE ~~~"
(cd build && emcmake cmake -G"Unix Makefiles" -DCMAKE_BUILD_TYPE=Debug -DWITH_12BIT=1 ..)
echo "~~~ MAKE ~~~"
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
echo "~~~ TEST:"
(cd test/node; npm run test)
