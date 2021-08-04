#!/bin/sh
# Disable exit on non 0
set +e
mkdir -p build
mkdir -p dist

# DEBUG CONFIGURE
#(cd build && emconfigure cmake -DCMAKE_BUILD_TYPE=Debug ..) &&

echo "~~~ CONFIGURE ~~~"
(cd build && emconfigure cmake ..)
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