#!/bin/bash

set -e

echo "==========================================="
echo "OpenJPEG Hot-Reload Development Mode"
echo "==========================================="

# Initialize git submodule if not already initialized
if [ ! -f "extern/openjpeg/CMakeLists.txt" ]; then
    echo "📦 Initializing git submodule..."
    git submodule update --init --recursive
fi

# Function to build the project
build_project() {
    echo ""
    echo "🔨 Building OpenJPEG ($(date '+%H:%M:%S'))..."

    # Clean and rebuild
    rm -rf build
    mkdir -p build
    mkdir -p dist

    echo "   📋 Configuring CMake (run 1)..."
    (cd build && emcmake cmake .. 2>&1 || true) | grep -E "(Error|Warning|--)" || true

    echo "   📋 Configuring CMake (run 2)..."
    (cd build && emcmake cmake .. 2>&1) | grep -E "(Error|Warning|--)" || true

    echo "   🏗️  Compiling with emmake..."
    (cd build && emmake make -j $(nproc) 2>&1) | tail -20

    echo "   📦 Copying artifacts..."
    cp ./build/extern/openjpeg/bin/openjpegjs.js ./dist 2>/dev/null || echo "      ⚠️  openjpegjs.js not found"
    cp ./build/extern/openjpeg/bin/openjpegjs.js.mem ./dist 2>/dev/null || echo "      ⚠️  openjpegjs.js.mem not found"
    cp ./build/extern/openjpeg/bin/openjpegwasm.js ./dist 2>/dev/null || echo "      ⚠️  openjpegwasm.js not found"
    cp ./build/extern/openjpeg/bin/openjpegwasm.wasm ./dist 2>/dev/null || echo "      ⚠️  openjpegwasm.wasm not found"
    cp ./build/extern/openjpeg/bin/openjpegjs_decode.js ./dist 2>/dev/null || echo "      ⚠️  openjpegjs_decode.js not found"
    cp ./build/extern/openjpeg/bin/openjpegjs_decode.js.mem ./dist 2>/dev/null || echo "      ⚠️  openjpegjs_decode.js.mem not found"
    cp ./build/extern/openjpeg/bin/openjpegwasm_decode.js ./dist 2>/dev/null || echo "      ⚠️  openjpegwasm_decode.js not found"
    cp ./build/extern/openjpeg/bin/openjpegwasm_decode.wasm ./dist 2>/dev/null || echo "      ⚠️  openjpegwasm_decode.wasm not found"

    echo ""
    echo "✅ Build complete! Output in ./dist/"
    ls -lh ./dist/ | tail -n +2
    echo ""
}

# Initial build
echo "🚀 Running initial build..."
build_project

echo "==========================================="
echo "👀 Watching for changes in src/ and extern/openjpeg/src/"
echo "   Press Ctrl+C to stop"
echo "==========================================="
echo ""

# Watch for changes and rebuild
inotifywait -m -r -e modify,create,delete \
    --exclude '(build|dist|node_modules|\.git)' \
    src/ extern/openjpeg/src/ extern/openjpeg/src/lib/ 2>/dev/null |
while read -r directory event filename; do
    if [[ "$filename" =~ \.(c|cpp|h|hpp)$ ]]; then
        echo "📝 Change detected: $directory$filename"
        sleep 0.5  # Debounce rapid changes
        build_project
        echo "==========================================="
        echo "👀 Continuing to watch for changes..."
        echo "==========================================="
        echo ""
    fi
done
