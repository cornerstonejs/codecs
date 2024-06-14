#!/bin/sh
mkdir -p build-native
#(cd build-native && cmake -DCMAKE_BUILD_TYPE=Debug ..) &&
(cd build-native && cmake -DBUILD_TESTING=OFF -DCMAKE_C_FLAGS="-march=native" ..) &&
(cd build-native && make VERBOSE=1 -j ${nprocs}) &&
(build-native/test/cpp/cpptest)