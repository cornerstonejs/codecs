
add_executable(openjpegjs jslib.cpp)

target_link_libraries(openjpegjs PRIVATE openjp2)

target_compile_features(openjpegjs PUBLIC cxx_std_11)

if (CMAKE_BUILD_TYPE STREQUAL Debug)
	SET(linkFlags "-g3")
else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
	SET(linkFlags "-O3")
endif()

set(CMAKE_CXX_FLAGS_RELEASE "-O3")

# add include path to openjpeg
include_directories("../extern/openjpeg/src/lib/openjp2" "../build/extern/openjpeg/src/lib/openjp2")

# -s ALLOW_MEMORY_GROWTH=1 \
# https://stackoverflow.com/a/53384917
set_target_properties(
    openjpegjs 
    PROPERTIES 
    LINK_FLAGS "\
      --bind \
      -s MODULARIZE=1 \
      -s EXPORT_NAME=OpenJPEGJS \
      -s WASM=0 \
      -s DISABLE_EXCEPTION_CATCHING=1 \
      -s ASSERTIONS=0 \
      -s NO_EXIT_RUNTIME=1 \
      -s MALLOC=emmalloc \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s TOTAL_MEMORY=1073741824 \
      -s FILESYSTEM=0 \
      -s EXPORTED_FUNCTIONS=[] \
      -s EXPORTED_RUNTIME_METHODS=[ccall] \
   ")

   add_executable(openjpegwasm jslib.cpp)

   target_link_libraries(openjpegwasm PRIVATE openjp2)
   
   target_compile_features(openjpegwasm PUBLIC cxx_std_11)
   
   if (CMAKE_BUILD_TYPE STREQUAL Debug)
     SET(linkFlags "-g3")
   else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
     SET(linkFlags "-O3")
   endif()
   
   set(CMAKE_CXX_FLAGS_RELEASE "-O3")
   
   # add include path to openjpeg
   include_directories("../extern/openjpeg/src/lib/openjp2" "../build/extern/openjpeg/src/lib/openjp2")
   
   
   set_target_properties(
    openjpegwasm 
       PROPERTIES 
       LINK_FLAGS "\
         --bind \
         -s MODULARIZE=1 \
         -s EXPORT_NAME=OpenJPEGWASM \
         -s DISABLE_EXCEPTION_CATCHING=1 \
         -s ASSERTIONS=0 \
         -s NO_EXIT_RUNTIME=1 \
         -s MALLOC=emmalloc \
         -s ALLOW_MEMORY_GROWTH=1 \
         -s TOTAL_MEMORY=1073741824 \
         -s FILESYSTEM=0 \
         -s EXPORTED_FUNCTIONS=[] \
         -s EXPORTED_RUNTIME_METHODS=[ccall] \
      ")
   