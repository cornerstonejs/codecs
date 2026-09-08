cmake_minimum_required(VERSION 3.16)
project(cornerstone-codec-libjxl CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "This project must be configured with emcmake (Emscripten).")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Where the libjxl submodule lives.
set(LIBJXL_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/extern/libjxl"
    CACHE PATH "Path to a libjxl source checkout")

if(NOT EXISTS "${LIBJXL_SOURCE_DIR}/lib/include/jxl/decode.h")
  message(FATAL_ERROR
    "libjxl sources not found at ${LIBJXL_SOURCE_DIR}. Update the Git "
    "submodules before configuring.")
endif()

# Emscripten's ENVIRONMENT. The shipped module targets the browser and the
# decode web worker only: including `node` makes the glue emit
# `await import("node:module")`, which rspack/webpack reject as an unhandled
# scheme. Configure a throwaway build dir with -DJXL_WASM_ENVIRONMENT=
# web,worker,node to get a module that can be benchmarked or tested under Node.
set(JXL_WASM_ENVIRONMENT "web,worker" CACHE STRING
    "Value passed to Emscripten's -sENVIRONMENT")

# These apply to libjxl and Highway as well as to the wrapper below, so they
# have to be set before add_subdirectory. Without -msimd128 Highway compiles
# only its scalar fallback and decoding is several times slower; SIMD is
# supported by every browser that can run this module, so it is on by default.
option(JXL_WASM_SIMD "Compile with WebAssembly SIMD (much faster decode)" ON)

if(JXL_WASM_SIMD)
  add_compile_options(-msimd128)
endif()

add_compile_options(-O3)

# Static, no tools/tests. Everything the command line tools would pull in is
# turned off.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(JPEGXL_STATIC ON CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TOOLS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_EXAMPLES OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_BENCHMARK OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_DOXYGEN OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_MANPAGES OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_JNI OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_SJPEG OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_OPENEXR OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TCMALLOC OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_PLUGINS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_DEVTOOLS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_COVERAGE OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_FUZZERS OFF CACHE BOOL "" FORCE)
set(JPEGXL_BUNDLE_LIBPNG OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_SKCMS ON CACHE BOOL "" FORCE)
set(JPEGXL_FORCE_SYSTEM_BROTLI OFF CACHE BOOL "" FORCE)
set(JPEGXL_FORCE_SYSTEM_HWY OFF CACHE BOOL "" FORCE)
# Needed for the JPEG XL JPEG Recompression transfer syntax
# (1.2.840.10008.1.2.4.111), whose streams carry a jbrd box.
set(JPEGXL_ENABLE_TRANSCODE_JPEG ON CACHE BOOL "" FORCE)

add_subdirectory("${LIBJXL_SOURCE_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/libjxl"
                 EXCLUDE_FROM_ALL)

# Decoder and encoder are separate modules. A viewer only ever decodes, and
# every decode worker fetches and compiles whatever it loads: linking the
# encoder in as well takes the module from 1.1 MB to 2.7 MB, which is paid per
# worker, per session, for code that never runs there.
#
# Each module compiles frame_info.cpp for the shared FrameInfo binding - once
# per module, since embind throws if a value_object name is registered twice.
function(add_jxl_wasm_module target source export_name)
  add_executable(${target} src/frame_info.cpp "${source}")

  # jxl_cms carries JxlGetDefaultCms(), which both halves need.
  target_link_libraries(${target} PRIVATE ${ARGN} jxl_cms)

  target_include_directories(${target} PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
    "${LIBJXL_SOURCE_DIR}/lib/include"
    "${CMAKE_CURRENT_BINARY_DIR}/libjxl/lib/include")

  target_compile_options(${target} PRIVATE -fexceptions -O3)
  if(JXL_WASM_SIMD)
    target_compile_options(${target} PRIVATE -msimd128)
  endif()

  set_target_properties(${target} PROPERTIES
    OUTPUT_NAME "${target}"
    SUFFIX ".js"
    LINK_FLAGS "\
-O3 \
-fexceptions \
-lembind \
-sWASM=1 \
-sMODULARIZE=1 \
-sEXPORT_ES6=1 \
-sEXPORT_NAME=${export_name} \
-sALLOW_MEMORY_GROWTH=1 \
-sMALLOC=emmalloc \
-sFILESYSTEM=0 \
-sENVIRONMENT=${JXL_WASM_ENVIRONMENT} \
-sEXPORTED_RUNTIME_METHODS=[getExceptionMessage,decrementExceptionRefcount] \
-sDYNAMIC_EXECUTION=0 \
-sTEXTDECODER=2 \
-sINCOMING_MODULE_JS_API=[locateFile,instantiateWasm,wasmBinary,print,printErr] \
")
endfunction()

# jxl_dec is the decode-only public library, so the decode module carries no
# encoder code at all; jxl is the full one (see lib/jxl.cmake).
add_jxl_wasm_module(jpegxlwasm_decode src/jpegxl_decode.cpp
                    createJpegXLDecoder jxl_dec)
add_jxl_wasm_module(jpegxlwasm_encode src/jpegxl_encode.cpp
                    createJpegXLEncoder jxl)
