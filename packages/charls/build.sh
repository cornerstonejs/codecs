#!/bin/sh
rm -rf build/ dist/
mkdir -p build
mkdir -p dist
#(cd build && emconfigure cmake -DCMAKE_BUILD_TYPE=Debug ..)
(cd build && emcmake cmake ..)
(cd build && emmake make VERBOSE=1 -j ${nprocs})
cp ./build/src/charlswasm.js ./dist
cp ./build/src/charlswasm.wasm ./dist
cp ./build/src/charlsjs.js ./dist
cp ./build/src/charlsjs.js.mem ./dist

cp ./build/src/charlswasm_decode.js ./dist
cp ./build/src/charlswasm_decode.wasm ./dist
cp ./build/src/charlsjs_decode.js ./dist
cp ./build/src/charlsjs_decode.js.mem ./dist
test_status=0
(npm run test:benchmark) || test_status=$?
node ../../tools/csp/check-generated-js.js ./dist || exit $?
exit "${test_status}"
