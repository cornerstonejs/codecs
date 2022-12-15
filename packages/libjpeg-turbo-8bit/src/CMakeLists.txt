

   include_directories("../extern/libjpeg-turbo" "../build/extern/libjpeg-turbo")

   add_executable(libjpegturbojs jslib.cpp)

   target_link_libraries(libjpegturbojs PRIVATE turbojpeg-static)
   
   target_compile_features(libjpegturbojs PUBLIC cxx_std_11)
   
   if (CMAKE_BUILD_TYPE STREQUAL Debug)
     SET(linkFlags "-g3")
   else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
     SET(linkFlags "-O3")
   endif()
   
   set(CMAKE_CXX_FLAGS_RELEASE "-O3")
   
   set_target_properties(
    libjpegturbojs 
       PROPERTIES 
       LINK_FLAGS "\
         --bind \
         -s MODULARIZE=1 \
         -s EXPORT_NAME=libjpegturbojs \
         -s WASM=0 \
         -s DISABLE_EXCEPTION_CATCHING=1 \
         -s ASSERTIONS=0 \
         -s NO_EXIT_RUNTIME=1 \
         -s MALLOC=emmalloc \
         -s TOTAL_MEMORY=50mb \
         -s FILESYSTEM=0 \
         -s EXPORTED_FUNCTIONS=[] \
         -s EXPORTED_RUNTIME_METHODS=[ccall] \
      ")

   add_executable(libjpegturbowasm jslib.cpp)

   target_link_libraries(libjpegturbowasm PRIVATE turbojpeg-static)

  #  target_compile_definitions(libjpegturbowasm PUBLIC WITH_SIMD=0)
   target_compile_features(libjpegturbowasm PUBLIC cxx_std_11)
   
   if (CMAKE_BUILD_TYPE STREQUAL Debug)
     SET(linkFlags "-g3")
   else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
     SET(linkFlags "-O3")
   endif()
   
   set(CMAKE_CXX_FLAGS_RELEASE "-O3")
   
   set_target_properties(
    libjpegturbowasm 
       PROPERTIES 
       LINK_FLAGS "\
         --bind \
         -s MODULARIZE=1 \
         -s EXPORT_NAME=libjpegturbowasm \
         -s DISABLE_EXCEPTION_CATCHING=1 \
         -s ASSERTIONS=0 \
         -s NO_EXIT_RUNTIME=1 \
         -s MALLOC=emmalloc \
         -s ALLOW_MEMORY_GROWTH=1 \
         -s TOTAL_MEMORY=50mb \
         -s FILESYSTEM=0 \
         -s EXPORTED_FUNCTIONS=[] \
         -s EXPORTED_RUNTIME_METHODS=[ccall] \
      ")


  # Decode-only version
  add_executable(libjpegturbojs_decode jslib-decode.cpp)

  target_link_libraries(libjpegturbojs_decode PRIVATE turbojpeg-static)

  target_compile_features(libjpegturbojs_decode PUBLIC cxx_std_11)
  
  if (CMAKE_BUILD_TYPE STREQUAL Debug)
    SET(linkFlags "-g3")
  else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
    SET(linkFlags "-O3")
  endif()
  
  set(CMAKE_CXX_FLAGS_RELEASE "-O3")
  
  set_target_properties(
    libjpegturbojs_decode 
      PROPERTIES 
      LINK_FLAGS "\
        --bind \
        -s MODULARIZE=1 \
        -s EXPORT_NAME=libjpegturbojs_decode \
        -s WASM=0 \
        -s DISABLE_EXCEPTION_CATCHING=1 \
        -s ASSERTIONS=0 \
        -s NO_EXIT_RUNTIME=1 \
        -s MALLOC=emmalloc \
        -s TOTAL_MEMORY=50mb \
        -s FILESYSTEM=0 \
        -s EXPORTED_FUNCTIONS=[] \
        -s EXPORTED_RUNTIME_METHODS=[ccall] \
        -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
      ")

  add_executable(libjpegturbowasm_decode jslib-decode.cpp)

  target_link_libraries(libjpegturbowasm_decode PRIVATE turbojpeg-static)
  
  # target_compile_definitions(libjpegturbowasm_decode PUBLIC WITH_SIMD=0 WITH_ARITH_ENC=0)
  target_compile_features(libjpegturbowasm_decode PUBLIC cxx_std_11)
  
  if (CMAKE_BUILD_TYPE STREQUAL Debug)
    SET(linkFlags "-g3")
  else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
    SET(linkFlags "-O3")
  endif()
  
  set(CMAKE_CXX_FLAGS_RELEASE "-O3")
  
  set_target_properties(
    libjpegturbowasm_decode 
      PROPERTIES 
      LINK_FLAGS "\
        --bind \
        -s MODULARIZE=1 \
        -s EXPORT_NAME=libjpegturbowasm_decode \
        -s DISABLE_EXCEPTION_CATCHING=1 \
        -s ASSERTIONS=0 \
        -s NO_EXIT_RUNTIME=1 \
        -s MALLOC=emmalloc \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s TOTAL_MEMORY=50mb \
        -s FILESYSTEM=0 \
        -s EXPORTED_FUNCTIONS=[] \
        -s EXPORTED_RUNTIME_METHODS=[ccall] \
        -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
      ")
  