#!/bin/sh
mkdir -p build
mkdir -p dist
#(cd build && CXXFLAGS=-msimd128 emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..)
(./extern/libjxl/deps.sh)
(cd build && CXXFLAGS=-msimd128 emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..)
(cd build && emmake make VERBOSE=1 -j ${nprocs})
cp ./build/src/libjxl.js ./dist
cp ./build/src/libjxl.wasm ./dist
# disable tests for now since CI doesn't like to run with SIMD
# (cd test/node; npm run test)
