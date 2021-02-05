#!/bin/sh
# Disable exit on non 0
set +e
mkdir -p build
#(cd build && emconfigure cmake -DCMAKE_BUILD_TYPE=Debug ..) &&
(cd build && emconfigure cmake ..) &&
(cd build && emmake make VERBOSE=1 -j 16) &&
cp ./build/extern/openjpeg/bin/openjpegjs.js ./dist && 
cp ./build/extern/openjpeg/bin/openjpegjs.js.mem ./dist &&
cp ./build/extern/openjpeg/bin/openjpegwasm.js ./dist &&
cp ./build/extern/openjpeg/bin/openjpegwasm.wasm ./dist &&
(cd test/node; npm run test)