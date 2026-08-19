
add_executable(openjphjs jslib.cpp)

# OpenJPH 0.30.1 builds a single `openjph` library (SIMD is folded in,
# architecture-agnostic); the old separate `openjphsimd` target no longer
# exists. Upstream's own wasm wrapper links `openjph` too.
target_link_libraries(openjphjs PRIVATE openjph)
# OpenJPH 0.30.1 moved its public headers under src/core/openjph (and
# src/core/shared); older releases exposed them on a flatter include path, so
# our bare `#include <ojph_arch.h>` no longer resolves via the linked target
# alone. Add the 0.30.1 header roots explicitly.
target_include_directories(openjphjs PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../extern/openjph/src/core/openjph
    ${CMAKE_CURRENT_SOURCE_DIR}/../extern/openjph/src/core/shared)
target_compile_options(openjphjs PRIVATE -DOJPH_ENABLE_WASM_SIMD -msimd128)
target_compile_features(openjphjs PUBLIC cxx_std_11)
# DISABLE_EXCEPTION_CATCHING=0 (double negative: exception catching ENABLED) is
# required, not a preference. HTJ2KDecoder::decode wraps read_headers and the
# tile-decode loop in try/catch so a truncated codestream degrades to a partial
# image instead of aborting; with catching disabled emscripten compiles those
# handlers out and the throw terminates the module. Costs some wasm size, which
# is why dist-size may need re-baselining.
set_target_properties(
    openjphjs 
    PROPERTIES 
    LINK_FLAGS "\
      -O3 \
      -s WASM=1 \
      --bind \
      -s DISABLE_EXCEPTION_CATCHING=0 \
      -s ASSERTIONS=0 \
      -s MODULARIZE=1 \
      -s NO_EXIT_RUNTIME=1 \
      -s MALLOC=emmalloc \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s INITIAL_MEMORY=50mb \
      -s FILESYSTEM=0 \
      -s EXPORTED_FUNCTIONS=[] \
      -s EXPORTED_RUNTIME_METHODS=[ccall] \
   ")
