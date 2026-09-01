#!/usr/bin/env bash
#
# Builds the libjxl decoder and encoder WASM modules into dist/.
#
# Requires an activated Emscripten SDK. Either have emcmake on PATH already, or
# point EMSDK at an emsdk checkout and this script will source its env for you.
#
#   EMSDK=/c/Apps/emsdk ./build.sh
#
# dist/ is build output and is not committed, matching every sibling codec: CI
# builds each package and hands the dist to the publish job as an artifact.

set -euo pipefail

cd "$(dirname "$0")"

LIBJXL_DIR="extern/libjxl"
BUILD_DIR="build"

if ! command -v emcmake >/dev/null 2>&1; then
  if [ -n "${EMSDK:-}" ] && [ -f "${EMSDK}/emsdk_env.sh" ]; then
    # shellcheck disable=SC1091
    source "${EMSDK}/emsdk_env.sh"
  else
    echo "emcmake not found. Activate the Emscripten SDK, or set EMSDK to an" >&2
    echo "emsdk checkout (e.g. EMSDK=/c/Apps/emsdk $0)." >&2
    exit 1
  fi
fi

if [ ! -f "${LIBJXL_DIR}/lib/include/jxl/decode.h" ]; then
  echo "libjxl submodule not found. Run:" >&2
  echo "  git submodule update --init packages/libjxl/extern/libjxl" >&2
  exit 1
fi

# libjxl declares ten submodules; the CMake options below link exactly three of
# them, and the rest (testdata alone is ~110 MB, plus googletest, libpng, zlib,
# lcms, sjpeg and libjpeg-turbo) are only needed by the tools and tests this
# build turns off. Initialising just these keeps a fresh checkout cheap, and
# means `git submodule update --init` without --recursive is enough.
#   brotli   JPEGXL_FORCE_SYSTEM_BROTLI=OFF
#   highway  JPEGXL_FORCE_SYSTEM_HWY=OFF
#   skcms    JPEGXL_ENABLE_SKCMS=ON
for dep in brotli highway skcms; do
  if [ ! -e "${LIBJXL_DIR}/third_party/${dep}/CMakeLists.txt" ] &&
     [ ! -e "${LIBJXL_DIR}/third_party/${dep}/skcms.cc" ]; then
    echo "Initialising libjxl's ${dep} submodule..."
    git -C "${LIBJXL_DIR}" submodule update --init --depth 1 \
      "third_party/${dep}"
  fi
done

rm -rf "${BUILD_DIR}" dist

echo "Configuring..."
emcmake cmake -S . -B "${BUILD_DIR}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DLIBJXL_SOURCE_DIR="$(pwd)/${LIBJXL_DIR}"

echo "Building..."
cmake --build "${BUILD_DIR}" \
  --target jpegxlwasm_decode jpegxlwasm_encode --parallel

mkdir -p dist
for module in jpegxlwasm_decode jpegxlwasm_encode; do
  cp "${BUILD_DIR}/${module}.js" "${BUILD_DIR}/${module}.wasm" dist/
done

echo "Done:"
ls -la dist/
