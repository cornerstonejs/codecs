
# Tests need to be added as executables first
add_executable(cpptest main.cpp)

# Should be linked to the main library, as well as the Catch2 testing library
target_link_libraries(cpptest PRIVATE openjp2)

#C++ 14
target_compile_features(cpptest PUBLIC cxx_std_14)

set(CMAKE_CXX_FLAGS_RELEASE "-O3")

# add include path to openjpeg
include_directories("../../extern/openjpeg/src/lib/openjp2" "../../build/extern/openjpeg/src/lib/openjp2"
                    "../../extern/openjpeg/src/bin/common" "../../build/extern/openjpeg/src/bin/common")
