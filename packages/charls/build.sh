#!/bin/sh
# Disable exit on non 0
set +e
mkdir -p build
mkdir -p dist

# DEBUG CONFIGURE
#(cd build && emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..)

echo "~~~ CONFIGURE ~~~"
(cd build && emcmake cmake ..)
echo "~~~ MAKE ~~~"
(cd build && emmake make VERBOSE=1 -j 16)
echo "~~~ COPY ~~~ "
cp ./build/src/charlswasm.js ./dist
cp ./build/src/charlswasm.wasm ./dist
cp ./build/src/charlsjs.js ./dist
cp ./build/src/charlsjs.js.mem ./dist

cp ./build/src/charlswasm_decode.js ./dist
cp ./build/src/charlswasm_decode.wasm ./dist
cp ./build/src/charlsjs_decode.js ./dist
cp ./build/src/charlsjs_decode.js.mem ./dist

echo "~~~ BUILD:"
(cd build && dir)
echo "~~~ DIST:"
(cd dist && dir)
