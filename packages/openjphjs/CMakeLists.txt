cmake_minimum_required(VERSION 3.16)

project (openjphjs
  LANGUAGES CXX)

# set the build type if not specified
set(default_build_type "Release")
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  message(STATUS "Setting build type to '${default_build_type}' as none was specified.")
  set(CMAKE_BUILD_TYPE "${default_build_type}")
endif()

if(NOT EXISTS "${PROJECT_SOURCE_DIR}/extern/openjph/CMakeLists.txt")
    message(FATAL_ERROR "The submodules were not downloaded! GIT_SUBMODULE was turned off or failed. Please update submodules and try again.")
endif()

# Drop the deprecated option this project used to set. Deleting the
# `option(OJPH_DISABLE_INTEL_SIMD ... ON)` line below does NOT remove it from an
# existing build/CMakeCache.txt, and upstream bridges it onto OJPH_DISABLE_SIMD
# with a plain `set()` whenever it is DEFINED -- which shadows the cache value
# forced below. So an incremental build in a tree configured before this change
# would silently keep producing the scalar wasm the comment below warns about.
# `unset(... CACHE)` removes the stale entry; on a fresh tree it is a no-op.
# Unconditional: native configurations can carry the same stale entry.
unset(OJPH_DISABLE_INTEL_SIMD CACHE)

if(EMSCRIPTEN)
  # OpenJPH 0.30.1 builds WASM SIMD by default (OJPH_DISABLE_SIMD=OFF) and emits
  # -msimd128 + the *_wasm.cpp kernels. Do NOT set the deprecated
  # OJPH_DISABLE_INTEL_SIMD: 0.30.1 bridges it onto OJPH_DISABLE_SIMD
  # (extern/openjph/CMakeLists.txt), so the old "=ON" — which used to mean
  # "skip Intel SIMD, use the WASM path" — now disables ALL SIMD and ships a
  # ~2x-slower scalar wasm. Keep SIMD explicitly enabled.
  set(OJPH_DISABLE_SIMD OFF CACHE BOOL "Enable OpenJPH WASM SIMD" FORCE)
endif()

option(BUILD_SHARED_LIBS "" OFF)

SET(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -O3 -fexceptions")

# add the external library
add_subdirectory(extern/openjph EXCLUDE_FROM_ALL)

# add the js wrapper
if(EMSCRIPTEN)
  # Generate Embind adapters at build time so consumers do not need CSP unsafe-eval.
  add_link_options(
    "-sDYNAMIC_EXECUTION=0"
    "-sEMBIND_AOT=1"
  )
  add_subdirectory(src)
endif()

# c++ native test case
if(NOT EMSCRIPTEN)
  add_subdirectory(test/cpp)
endif()
