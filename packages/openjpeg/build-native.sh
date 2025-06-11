#!/bin/sh
rm -rf build-native
mkdir -p build-native
(cd build-native && cmake -DCMAKE_BUILD_TYPE=Debug -DCMAKE_INSTALL_PREFIX=../../../../codecs/openjpeg ..) &&
#(cd build-native && cmake ..) &&
(cd build-native && make VERBOSE=1 -j 8) &&
#(build-native/test/cpp/cpptest) &&
(build-native/extern/openjpeg/bin/cpptest) &&
(cd build-native/extern/openjpeg && make install)
