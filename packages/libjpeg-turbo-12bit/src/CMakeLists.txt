

   # libjpeg-turbo 3.x moved public headers under src/; jconfig.h is generated
   # into the standalone build dir. jpeg-static is consumed as a pre-built
   # IMPORTED library (built separately by build.sh — 3.x forbids add_subdirectory).
   include_directories(
     "../extern/libjpeg-turbo/src"
     "${LIBJPEG_TURBO_BUILD_DIR}"
     "${LIBJPEG_TURBO_BUILD_DIR}/src")

   add_library(jpeg-static STATIC IMPORTED)
   set_target_properties(jpeg-static PROPERTIES
     IMPORTED_LOCATION "${LIBJPEG_TURBO_BUILD_DIR}/libjpeg.a")

   add_executable(libjpegturbo12js jslib.cpp)

   target_link_libraries(libjpegturbo12js PRIVATE jpeg-static)
   
   #target_compile_definitions(libjpegturbo12js PUBLIC WITH_12BIT=1)
   target_compile_features(libjpegturbo12js PUBLIC cxx_std_11)
   
   if (CMAKE_BUILD_TYPE STREQUAL Debug)
     SET(linkFlags "-g3")
   else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
     SET(linkFlags "-O3")
   endif()
   
   set(CMAKE_CXX_FLAGS_RELEASE "-O3")
   
   set_target_properties(
    libjpegturbo12js 
       PROPERTIES 
       LINK_FLAGS "\
         --bind \
         -s MODULARIZE=1 \
         -s EXPORT_NAME=libjpegturbo12js \
         -s WASM=0 \
         -s DISABLE_EXCEPTION_CATCHING=1 \
         -s ASSERTIONS=0 \
         -s NO_EXIT_RUNTIME=1 \
         -s MALLOC=emmalloc \
         -s ALLOW_MEMORY_GROWTH=1 \
         -s INITIAL_MEMORY=50mb \
         -s FILESYSTEM=0 \
         -s EXPORTED_FUNCTIONS=[] \
         -s EXPORTED_RUNTIME_METHODS=[ccall] \
         -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
      ")

   add_executable(libjpegturbo12wasm jslib.cpp)

   target_link_libraries(libjpegturbo12wasm PRIVATE jpeg-static)
   
   target_compile_definitions(libjpegturbo12wasm PUBLIC WITH_12BIT=1)
   target_compile_definitions(libjpegturbo12wasm PUBLIC WITH_12BIT=1 WITH_JPEG8=1)
   target_compile_features(libjpegturbo12wasm PUBLIC cxx_std_11)
   
   if (CMAKE_BUILD_TYPE STREQUAL Debug)
     SET(linkFlags "-g3")
   else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
     SET(linkFlags "-O3")
   endif()
   
   set(CMAKE_CXX_FLAGS_RELEASE "-O3")
   
   set_target_properties(
    libjpegturbo12wasm 
       PROPERTIES 
       LINK_FLAGS "\
         --bind \
         -s MODULARIZE=1 \
         -s EXPORT_NAME=libjpegturbo12wasm \
         -s DISABLE_EXCEPTION_CATCHING=1 \
         -s ASSERTIONS=0 \
         -s NO_EXIT_RUNTIME=1 \
         -s MALLOC=emmalloc \
         -s ALLOW_MEMORY_GROWTH=1 \
         -s INITIAL_MEMORY=50mb \
         -s FILESYSTEM=0 \
         -s EXPORTED_FUNCTIONS=[] \
         -s EXPORTED_RUNTIME_METHODS=[ccall] \
         -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
      ")
   