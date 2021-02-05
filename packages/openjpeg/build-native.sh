#!/bin/sh
mkdir -p build-native
(cd build-native && cmake -DCMAKE_BUILD_TYPE=Debug ..) &&
#(cd build-native && cmake ..) &&
(cd build-native && make VERBOSE=1 -j 8) &&
#(build-native/test/cpp/cpptest) &&
(build-native/extern/openjpeg/bin/cpptest)
