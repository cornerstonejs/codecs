# OpenJPEG Hot-Reload Development

## One-Time Setup
```bash
cd packages/openjpeg
./setup-dev.sh
docker-compose -f docker-compose.dev.yml up -d

# Create yarn links
yarn link
cd ../../cornerstone3D && yarn link "@cornerstonejs/codec-openjpeg"
cd packages/dicomImageLoader && yarn link "@cornerstonejs/codec-openjpeg"
```

## Daily Development
```bash
# 1. Start Docker (if not running)
cd packages/openjpeg && docker-compose -f docker-compose.dev.yml up

# 2. Start cornerstone3D (separate terminal)
cd cornerstone3D && yarn run example local

# 3. Edit C files in packages/openjpeg/extern/openjpeg/src/lib/openjp2/
# 4. Docker auto-rebuilds → Hard refresh browser (Cmd+Shift+R)
# 5. Check browser DevTools console for printf output
```

## Key Points
- Edit C code in: `packages/openjpeg/extern/openjpeg/src/lib/openjp2/`
- Watch Docker terminal for "✅ Build complete!"
- Hard refresh browser after each rebuild
- `printf()` in C → `console.log()` in browser DevTools

## Quick Commands
```bash
docker logs -f openjpeg-dev              # View build logs
docker-compose -f docker-compose.dev.yml down  # Stop container
strings dist/openjpegwasm.wasm | grep "text"  # Verify changes compiled
```
