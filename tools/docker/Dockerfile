# Toolchain image for building the wasm codecs outside a devcontainer.
#
# Deliberately mirrors the "Install cmake + C++ build deps" step of the build
# job in .github/workflows/pr-checks.yml: same emsdk tag, same cmake, same node
# major. A local `pnpm docker:build` should produce the dist that CI produces —
# if this drifts from the workflow, the dist-size baseline and the decode
# goldens start disagreeing with local builds.
#
# NOTE: .devcontainer/Dockerfile pins an older emsdk (3.1.53) and is NOT the
# same environment. This image is the one that matches CI.

ARG EMSDK_VERSION=3.1.74
FROM emscripten/emsdk:${EMSDK_VERSION}

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get -y install --no-install-recommends build-essential git ca-certificates curl \
    # cmake 3.17.4, same as CI — the CMakeLists here are not tested against newer.
    && wget -qO- "https://cmake.org/files/v3.17/cmake-3.17.4-Linux-x86_64.tar.gz" \
       | tar --strip-components=1 -xz -C /usr/local \
    # node 22 on PATH, matching CI's setup-node step. emcc is unaffected: it
    # invokes the node pinned in its own .emscripten config, not this one.
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# The emscripten cache is written during the first build of each port (zlib
# etc.). Make it writable by any uid so `docker run --user $(id -u)` — which
# tools/docker/build.sh uses on Linux to keep dist/ host-owned — still works.
RUN chmod -R a+rwX "$(dirname "$(dirname "$(which emcc)")")/cache" 2>/dev/null || true

ENV DEBIAN_FRONTEND=dialog
