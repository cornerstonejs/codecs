#!/bin/sh
clear
rm -rf build
rm -rf dist
mkdir -p dist
mkdir -p build
#(cd build && emcmake cmake -DCMAKE_C_FLAGS=Debug ..) &&
(cd build && emcmake cmake -DENABLE_WASM_SIMD=1 -DSIMD=1 -DSKIP_TEST=1 -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=0 ..) &&
(cd build && emmake make VERBOSE=1 -j ${nprocs}) &&
cp ./build/src/libjxljs.js ./dist &&
cp ./build/src/libjxljs.wasm ./dist &&
(cd test/node; node index.mjs)
