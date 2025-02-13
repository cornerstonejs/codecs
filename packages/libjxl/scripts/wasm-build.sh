#!/bin/sh
rm -rf build
rm -rf dist
mkdir -p dist
mkdir -p build
#(cd build && emconfigure cmake -DCMAKE_BUILD_TYPE=Debug ..) &&
# enabling simd has no effort as of Oct 9, 2021
#(cd build && emcmake cmake -DCMAKE_C_FLAGS="-msimd128"  ..) &&
(cd build && emcmake cmake -DCMAKE_C_FLAGS="" ..) &&
(cd build && emmake make VERBOSE=1 -j ${nprocs}) &&
cp ./build/src/libjxljs.js ./dist
cp ./build/src/libjxljs.wasm ./dist
(cd test/node; npm run test)
