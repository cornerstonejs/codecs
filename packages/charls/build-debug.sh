#!/bin/sh
# Disable exit on non 0
set +e
rm -rf build
mkdir -p build
mkdir -p dist/debug

echo "~~~ DEBUG CONFIGURE ~~~"
(cd build && emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..)
echo "~~~ MAKE ~~~"
(cd build && emmake make VERBOSE=1 -j 16)
echo "~~~ COPY ~~~ "
cp ./build/src/charlswasm.js ./dist/debug
cp ./build/src/charlswasm.wasm ./dist/debug
cp ./build/src/charlsjs.js ./dist/debug
cp ./build/src/charlsjs.js.mem ./dist/debug

echo "~~~ BUILD:"
(cd build && dir)
echo "~~~ DIST:"
(cd dist/debug && dir)
