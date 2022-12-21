#!/bin/sh
# Disable exit on non 0
set +e
mkdir -p build
mkdir -p dist

# DEBUG CONFIGURE
#(cd build && emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..) &&

echo "~~~ CONFIGURE ~~~"
# Only include decoding to make it smaller
# see https://github.com/libjpeg-turbo/libjpeg-turbo/issues/431
(cd build && emcmake cmake -G"Unix Makefiles" ..)
#(cd build && emcmake cmake -G"Unix Makefiles"..)
echo "~~~ MAKE ~~~"
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
