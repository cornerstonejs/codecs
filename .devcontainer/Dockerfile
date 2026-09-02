FROM emscripten/emsdk:3.1.53

# Avoid warnings by switching to noninteractive
ENV DEBIAN_FRONTEND=noninteractive

# This Dockerfile's base image has a non-root user with sudo access. Use the "remoteUser"
# property in devcontainer.json to use it. On Linux, the container user's GID/UIDs
# will be updated to match your local UID/GID (when using the dockerFile property).
# See https://aka.ms/vscode-remote/containers/non-root-user for details.
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Configure apt and install packages
RUN apt-get update \
    #
    # Install C++ tools
    && apt-get -y install build-essential cppcheck valgrind kcachegrind \

    # Dependencies for libjpeg-turbo builds
    # && apt-get -y install nasm texinfo \

    # version 3.17 of cmake
    && wget -qO- "https://cmake.org/files/v3.17/cmake-3.17.4-Linux-x86_64.tar.gz" | tar --strip-components=1 -xz -C /usr/local \
    # sudo
    && apt-get -y install sudo \
    #
    # [Optional] Update UID/GID if needed
    && if [ "$USER_GID" != "1000" ] || [ "$USER_UID" != "1000" ]; then \
        groupmod --gid $USER_GID $USERNAME \
        && usermod --uid $USER_UID --gid $USER_GID $USERNAME \
        && chown -R $USER_UID:$USER_GID /home/$USERNAME; \
    fi \
    #
    # Clean up
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# node 24 to match CI, and to satisfy the root package.json engines.node
# floor (>=24) — pnpm warns "Unsupported engine" on anything below it. Only
# the node major is shared with CI: the emsdk pin above is deliberately older
# than the one tools/docker/Dockerfile and the build job use, so this image is
# for editing and running the JS tooling, not for reproducing a CI dist.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
RUN apt-get install -y nodejs
# Corepack reads the pinned pnpm version from the repo's package.json
# "packageManager" field on first use, so there is nothing to pin here.
RUN corepack enable pnpm

# Switch back to dialog for any ad-hoc use of apt-get
ENV DEBIAN_FRONTEND=dialog
