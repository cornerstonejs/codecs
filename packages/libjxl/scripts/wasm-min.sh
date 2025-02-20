rm ./build/src/libjxljs.* ./dist/*
(cd build && emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..) &&
(cd build && emmake make VERBOSE=1 -j ${nprocs}) &&
cp ./build/src/libjxljs.js ./dist 
cp ./build/src/libjxljs.wasm ./dist
(cd test/node; npm run test)
