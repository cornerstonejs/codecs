#!/bin/sh
mkdir -p build
mkdir -p dist
#(cd build && emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..)
(cd build && CXXFLAGS=-msimd128 emcmake cmake ..)
(cd build && emmake make VERBOSE=1 -j ${nprocs})
cp ./build/src/openjphjs.js ./dist
cp ./build/src/openjphjs.wasm ./dist
# disable tests for now since CI doesn't like to run with SIMD
# (cd test/node; npm run test)
