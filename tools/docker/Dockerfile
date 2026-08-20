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

# amd64 is not incidental: cmake.org published no Linux aarch64 archive until
# 3.20, so the 3.17.4 tarball below is x86_64-only.
#
# The default tag is already safe — emscripten/emsdk:3.1.74 is a single-arch
# amd64 manifest, so even an arm64 host pulls amd64 and runs it emulated (slower
# than native, but the same bytes CI builds, which is the point of this file).
# The pin is for EMSDK_VERSION overrides: emsdk also publishes arch-suffixed
# tags, and `EMSDK_VERSION=3.1.74-arm64` builds an arm64 image with an x86_64
# cmake in it — an image that builds fine and then fails as an exec format error
# partway through a codec build, 20 layers down in cmake output.
#
# The pin alone only downgrades that to a BuildKit warning (the base image is
# still pulled for its own arch), so the `cmake --version` below turns it into a
# failed image build. Belt and braces, but the failure mode it replaces is
# genuinely hard to read.
#
# Overriding BUILD_PLATFORM means supplying an arm64 cmake as well. It exists as
# an ARG rather than inline because BuildKit lints a constant `--platform`
# (FromPlatformFlagConstDisallowed) — a rule aimed at multi-platform builds,
# which is not something this single-arch toolchain image does.
ARG BUILD_PLATFORM=linux/amd64
FROM --platform=${BUILD_PLATFORM} emscripten/emsdk:${EMSDK_VERSION}

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get -y install --no-install-recommends build-essential git ca-certificates curl \
    # cmake 3.17.4, same as CI — the CMakeLists here are not tested against
    # newer. Digest-checked, same pin as the workflows; from
    # https://cmake.org/files/v3.17/cmake-3.17.4-SHA-256.txt.
    && wget -q -O /tmp/cmake.tar.gz "https://cmake.org/files/v3.17/cmake-3.17.4-Linux-x86_64.tar.gz" \
    && echo "126cc8356907913787d4ff35237ae1854c09b927a35dbe5270dd571ae224bdd3  /tmp/cmake.tar.gz" | sha256sum -c - \
    && tar --strip-components=1 -xzf /tmp/cmake.tar.gz -C /usr/local \
    && rm -f /tmp/cmake.tar.gz \
    # Prove the binary actually runs here. Extracting an x86_64 cmake into an
    # arm64 image succeeds silently (see the BUILD_PLATFORM note above); this is
    # what makes that fail now, with a readable message, instead of during a
    # codec build later.
    && cmake --version \
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
