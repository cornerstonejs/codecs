#!/bin/sh
mkdir -p build
#(cd build && emconfigure cmake -DCMAKE_BUILD_TYPE=Debug ..)
(cd build && CXXFLAGS=-msimd128 emcmake cmake ..)
(cd build && emmake make VERBOSE=1 -j ${nprocs})
cp ./build/src/libjxljs.js ./dist
cp ./build/src/libjxljs.wasm ./dist
#(cd test/node; npm run test)