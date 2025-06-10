#!/bin/sh
rm -rf build-native
mkdir -p build-native
(cd build-native && CC=clang CXX=clang++ cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF -DJPEGXL_ENABLE_TOOLS=false ..)
#(cd build && cmake ..)
(cd build-native && CC=clang CXX=clang++ make VERBOSE=1 -j 8)
(build-native/test/cpp/cpptest)