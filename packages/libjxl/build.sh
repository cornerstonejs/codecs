#!/usr/bin/env bash
#
# Builds the libjxl decoder and encoder WASM modules into dist/.
#
# Requires an activated Emscripten SDK. Either have emcmake on PATH already, or
# point EMSDK at an emsdk checkout and this script will source its env for you.
#
#   EMSDK=/c/Apps/emsdk ./build.sh
#
# The build output (dist/*.js and dist/*.wasm) is committed, so only someone
# changing the sources in src/ or updating the libjxl submodule needs to run it.

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
  echo "  git submodule update --init --recursive" >&2
  exit 1
fi

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
