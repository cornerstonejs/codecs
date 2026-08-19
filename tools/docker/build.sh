#!/usr/bin/env bash
#
# Build the wasm codecs in Docker, from a normal host shell.
#
# The emscripten toolchain only exists in a container, but you do not have to
# work *inside* one to use it: this mounts the repo into the CI toolchain image
# (tools/docker/Dockerfile) and runs the package's own build.sh there, writing
# build/ and dist/ straight back onto the host. Editors, git and anything else
# stay on the host.
#
# Usage:
#   pnpm docker:build                      # every wasm codec
#   pnpm docker:build charls openjpeg      # just these
#   pnpm --filter @cornerstonejs/codec-openjph docker:build
#
# Environment:
#   EMSDK_VERSION         emsdk tag to build against (default 3.1.74, = CI)
#   CODECS_BUILD_IMAGE    override the local image tag
#   CODECS_KEEP_BUILD=1   keep packages/<pkg>/{build,dist} for a faster
#                         incremental rebuild. Off by default because stale
#                         leftovers silently corrupt a build — see the comment
#                         on the clean step below.
#
# Nothing from node_modules is needed inside the container: build.sh uses only
# node builtins, and the nested test/node packages it runs have no dependencies.
# So the host's (Windows/macOS-native) node_modules is simply ignored rather
# than having to be shadowed or reinstalled.

set -euo pipefail

EMSDK_VERSION="${EMSDK_VERSION:-3.1.74}"
IMAGE="${CODECS_BUILD_IMAGE:-codecs-build:emsdk-${EMSDK_VERSION}}"

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

# The packages whose build needs emscripten. big-endian, little-endian and
# dicom-codec are plain JS/webpack — build those natively with `pnpm run build`.
WASM_PACKAGES=(charls libjpeg-turbo-8bit libjpeg-turbo-12bit openjpeg openjphjs)

case "${1:-}" in
  -h | --help)
    # Print this file's header comment, minus the shebang, as the usage text.
    awk 'NR > 2 && /^#/ { sub(/^# ?/, ""); print; next } NR > 2 { exit }' "${BASH_SOURCE[0]}"
    exit 0
    ;;
esac

packages=("$@")
if [ ${#packages[@]} -eq 0 ]; then
  packages=("${WASM_PACKAGES[@]}")
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not on PATH. Install Docker Desktop (or the engine) first." >&2
  exit 1
fi

for pkg in "${packages[@]}"; do
  if [ ! -f "$REPO_ROOT/packages/$pkg/build.sh" ]; then
    echo "No packages/$pkg/build.sh — this script builds the wasm codecs:" >&2
    printf '  %s\n' "${WASM_PACKAGES[@]}" >&2
    exit 1
  fi

  # A submodule that was never initialised produces a confusing cmake failure
  # 20 layers down; say so up front instead.
  extern="$REPO_ROOT/packages/$pkg/extern"
  if [ -d "$extern" ] && [ -z "$(ls -A "$extern" 2>/dev/null)" ]; then
    echo "packages/$pkg/extern is empty — initialise the submodule first:" >&2
    echo "  git submodule update --init --recursive packages/$pkg/extern" >&2
    exit 1
  fi
done

# Git Bash rewrites anything that looks like a unix path in a command line, which
# mangles both the volume spec and the in-container paths. Turn that off, and
# hand Docker a Windows-shaped host path (cygpath -m gives Z:/src/codecs).
HOST_ROOT="$REPO_ROOT"
if command -v cygpath >/dev/null 2>&1; then
  HOST_ROOT=$(cygpath -m "$REPO_ROOT")
  export MSYS_NO_PATHCONV=1
fi

echo "==> Building toolchain image $IMAGE (cached after the first run)"
# HOST_ROOT, not REPO_ROOT: with path conversion disabled above, Docker has to
# be handed the path in the host OS's own shape — including the build context.
docker build \
  --tag "$IMAGE" \
  --build-arg "EMSDK_VERSION=$EMSDK_VERSION" \
  "$HOST_ROOT/tools/docker"

run_opts=(--rm --volume "$HOST_ROOT:/src" --workdir /src)

if [ "$(uname -s)" = "Linux" ]; then
  # Without this every file the build writes lands root-owned on the host.
  # HOME and EM_CACHE have to move somewhere writable to match.
  run_opts+=(
    --user "$(id -u):$(id -g)"
    --env HOME=/tmp
    --env EM_CACHE=/tmp/emscripten-cache
  )
fi

if [ -t 1 ]; then
  run_opts+=(--tty)
fi

for pkg in "${packages[@]}"; do
  echo
  echo "==> Building $pkg"

  # Start from an empty build/ and dist/ unless asked not to. CI always does —
  # its runners check out fresh — and the packages disagree about it among
  # themselves: charls clears both, openjpeg clears build/, libjpeg-turbo-12bit
  # clears dist/, and libjpeg-turbo-8bit and openjphjs clear neither. Both
  # kinds of leftover cause real damage:
  #
  #   build/  a CMakeCache.txt written by a different toolchain is silently
  #           authoritative — cmake will not apply link flags the cached
  #           configure never saw. A cache left by the old devcontainer emsdk
  #           produced artifacts missing -sDYNAMIC_EXECUTION=0/-sEMBIND_AOT=1,
  #           which build.sh's own CSP check then (correctly) rejected.
  #   dist/   artifacts the current emsdk no longer emits (the .js.mem files)
  #           linger forever. dist is in these packages' "files" array, so a
  #           local publish would ship them, and tools/dist-size/check.js flags
  #           them as unexplained new artifacts.
  if [ -n "${CODECS_KEEP_BUILD:-}" ]; then
    echo "    CODECS_KEEP_BUILD set — reusing packages/$pkg/{build,dist}"
  else
    rm -rf "$REPO_ROOT/packages/$pkg/build" "$REPO_ROOT/packages/$pkg/dist"
  fi

  docker run "${run_opts[@]}" "$IMAGE" bash -c "cd 'packages/$pkg' && bash build.sh"
done

echo
echo "Done. Built: ${packages[*]}"
