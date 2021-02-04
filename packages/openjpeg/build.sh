#!/bin/sh
# Disable exit on non 0
set +e
mkdir -p build
#(cd build && emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..) &&

# This worked in: trzeci/emscripten:1.39.4-fastcomp
# but not w/ newer versions of emscripten
# (cd build && emconfigure cmake ..) &&
# ~ Build Native
# (cd build && cmake -DCMAKE_BUILD_TYPE=Debug ..) &&
# (cd build && make VERBOSE=1 -j 8) &&
# (build/extern/openjpeg/bin/cpptest)

# ~ Build WASM/JS
# (cd build && emcmake cmake ..) || echo 0 &&
# (cd build && emcmake cmake ..) &&
# (cd build && emmake make VERBOSE=1 -j 16) &&
# cp ./build/extern/openjpeg/bin/openjpegjs.js ./dist && 
# cp ./build/extern/openjpeg/bin/openjpegjs.js.mem ./dist &&
# cp ./build/extern/openjpeg/bin/openjpegwasm.js ./dist &&
# cp ./build/extern/openjpeg/bin/openjpegwasm.wasm ./dist &&
# (cd test/node; npm run test)

(cd build && emconfigure cmake ..)
(cd build && emmake make VERBOSE=1 -j 16)
cp ./build/src/openjpegjs.js ./dist
cp ./build/src/openjpegjs.wasm ./dist
# (cd test/node; npm run test)
