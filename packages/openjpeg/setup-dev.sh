#!/bin/bash

set -e

echo "==========================================="
echo "OpenJPEG Development Setup"
echo "==========================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

echo "✅ Docker is running"

# Initialize submodules
echo ""
echo "📦 Initializing git submodules..."
git submodule update --init --recursive

echo ""
echo "🔨 Building Docker image..."
docker-compose -f docker-compose.dev.yml build

echo ""
echo "==========================================="
echo "✅ Setup complete!"
echo "==========================================="
echo ""
echo "To start development:"
echo "  1. Run: docker-compose -f docker-compose.dev.yml up"
echo "  2. In another terminal, link to dicomImageLoader:"
echo "     cd /Users/im/Desktop/ibrahim/Personal/Work/NewLantern/codecs/packages/openjpeg"
echo "     yarn link"
echo "     cd /Users/im/Desktop/ibrahim/Personal/Work/NewLantern/codecs/cornerstone3D"
echo "     yarn link @cornerstonejs/codec-openjpeg"
echo ""
echo "The container will watch for changes in src/ and extern/openjpeg/src/"
echo "and automatically rebuild when you save files."
echo ""
