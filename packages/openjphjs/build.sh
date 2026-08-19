#!/bin/sh
set -e

mkdir -p build
mkdir -p dist
(cd build && CXXFLAGS=-msimd128 emcmake cmake -DCMAKE_BUILD_TYPE=Release ..)
# NOTE: this shipped a Debug (-O0) wasm until now, which left the SIMD kernels
# unoptimized (SIMD intrinsics not inlined) — making decode/encode far slower
# and the binary far larger than they should be. Release (-O3) is the correct
# artifact for a published codec.
(cd build && emmake make VERBOSE=1 -j ${nprocs})
cp ./build/src/openjphjs.js ./dist
cp ./build/src/openjphjs.wasm ./dist
# disable tests for now since CI doesn't like to run with SIMD
# (cd test/node; npm run test)
node ../../tools/csp/check-generated-js.js ./dist
