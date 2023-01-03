
add_executable(charlsjs jslib.cpp)

target_link_libraries(charlsjs PRIVATE charls)

target_compile_features(charlsjs PUBLIC cxx_std_17)

if (CMAKE_BUILD_TYPE STREQUAL Debug)
	SET(linkFlags "-g3")
else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
	SET(linkFlags "-O3")
endif()

set(CMAKE_CXX_FLAGS_RELEASE "-O3")

##
## https://emscripten.org/docs/getting_started/FAQ.html#how-can-i-tell-when-the-page-is-fully-loaded-and-it-is-safe-to-call-compiled-functions
#
set_target_properties(
    charlsjs 
    PROPERTIES 
    LINK_FLAGS "\
      --bind \
      -s MODULARIZE=1 \
      -s EXPORT_NAME=CharLS \
      -s WASM=0 \
      -s NO_EXIT_RUNTIME=1 \
      -s DISABLE_EXCEPTION_CATCHING=1 \
      -s MALLOC=emmalloc \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s TOTAL_MEMORY=50mb \
      -s ASSERTIONS=0 \
      -s FILESYSTEM=0 \
      -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
      -s EXPORTED_FUNCTIONS=[] \
      -s EXPORTED_RUNTIME_METHODS=[ccall] \
   ")
#-s EXPORTED_FUNCTIONS=[___lsan_do_recoverable_leak_check] \

## WASM BUILD
add_executable(charlswasm jslib.cpp)

target_link_libraries(charlswasm PRIVATE charls)

target_compile_features(charlswasm PUBLIC cxx_std_17)

if (CMAKE_BUILD_TYPE STREQUAL Debug)
  SET(linkFlags "-g3")
else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
  SET(linkFlags "-O3")
endif()

set(CMAKE_CXX_FLAGS_RELEASE "-O3")

set_target_properties(
  charlswasm 
    PROPERTIES 
    LINK_FLAGS "\
      --bind \
      -s MODULARIZE=1 \
      -s EXPORT_NAME=CharLSWASM \
      -s DISABLE_EXCEPTION_CATCHING=1 \
      -s ASSERTIONS=0 \
      -s NO_EXIT_RUNTIME=1 \
      -s MALLOC=emmalloc \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s TOTAL_MEMORY=50mb \
      -s FILESYSTEM=0 \
      -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
      -s EXPORTED_FUNCTIONS=[] \
      -s EXPORTED_RUNTIME_METHODS=[ccall] \
   ")

   # -fsanitize=address \
   # -s EXPORTED_FUNCTIONS=[___lsan_do_recoverable_leak_check] \

#### DECODE-ONLY VERSION
add_executable(charlsjs_decode jslib-decode.cpp)

target_link_libraries(charlsjs_decode PRIVATE charls)

target_compile_features(charlsjs_decode PUBLIC cxx_std_17)

if (CMAKE_BUILD_TYPE STREQUAL Debug)
	SET(linkFlags "-g3")
else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
	SET(linkFlags "-O3")
endif()

set(CMAKE_CXX_FLAGS_RELEASE "-O3")

##
## https://emscripten.org/docs/getting_started/FAQ.html#how-can-i-tell-when-the-page-is-fully-loaded-and-it-is-safe-to-call-compiled-functions
#   
#   -s MODULARIZE=1 \
#   -s WASM=0 \
#
set_target_properties(
    charlsjs_decode 
    PROPERTIES 
    LINK_FLAGS "\
      --bind \
      -s MODULARIZE=1 \
      -s EXPORT_NAME=CharLS \
      -s WASM=0 \
      -s NO_EXIT_RUNTIME=1 \
      -s DISABLE_EXCEPTION_CATCHING=1 \
      -s MALLOC=emmalloc \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s TOTAL_MEMORY=50mb \
      -s ASSERTIONS=0 \
      -s FILESYSTEM=0 \
      -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
      -s EXPORTED_FUNCTIONS=[] \
      -s EXPORTED_RUNTIME_METHODS=[ccall] \
   ")

# -fsanitize=address \
#-s EXPORTED_FUNCTIONS=[___lsan_do_recoverable_leak_check] \

## WASM BUILD
add_executable(charlswasm_decode jslib-decode.cpp)

target_link_libraries(charlswasm_decode PRIVATE charls)

target_compile_features(charlswasm_decode PUBLIC cxx_std_17)

if (CMAKE_BUILD_TYPE STREQUAL Debug)
  SET(linkFlags "-g3")
else() # Either MinSizeRel, RelWithDebInfo or Release, all which run with optimizations enabled.
  SET(linkFlags "-O3")
endif()

set(CMAKE_CXX_FLAGS_RELEASE "-O3")

set_target_properties(
  charlswasm_decode 
    PROPERTIES 
    LINK_FLAGS "\
      --bind \
      -s MODULARIZE=1 \
      -s EXPORT_NAME=CharLSWASM \
      -s DISABLE_EXCEPTION_CATCHING=1 \
      -s ASSERTIONS=0 \
      -s NO_EXIT_RUNTIME=1 \
      -s MALLOC=emmalloc \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s TOTAL_MEMORY=50mb \
      -s FILESYSTEM=0 \
      -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
      -s EXPORTED_FUNCTIONS=[] \
      -s EXPORTED_RUNTIME_METHODS=[ccall] \
   ")

   #      -fsanitize=address \
