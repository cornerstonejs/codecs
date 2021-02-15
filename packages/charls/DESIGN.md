# CharLS-JS Design

The [original JS build of CharLS](https://github.com/cornerstonejs/charls) 
was done in 2016 specifically to add JPEG-LS decoding to
[cornerstonejs](https://github.com/cornerstonejs).  Unfortunately nobody
picked up maintainence for the original project so it fell behind
a major version release of CharLS and never took advantage of
WASM support that was later added to NodeJS and browsers.

To prevent the library falling behind again, I thought it would be good
to [merge it into the main CharLS library](https://github.com/team-charls/charls/issues/13).
After quite a bit of research and experimentation, I decided it would be better
to keep the JS/WASM code separate from the main CharLS library but improve the way
the JS/WASM project was setup to ease maintenance.  Part of my research lead
me to discover [Modern CMake](https://cliutils.gitlab.io/modern-cmake/) which lead
to a prototype of how it would work with EMSCRIPTEN 
[here](https://github.com/chafey/modern-cpp-lib-js).

## Git Submodules

The main charls library is referenced as a git submodule.  This strategy ensures
that JS/WASM code does not creep into the main charls library so it can
remain pure C/C++ code.  This strategy also simplifies maintenance since the
charls submodule tracks the master branch and can be easily updated to
new versions via 

``` bash
git pull --recurse-submodules
git submodule update --remote
```

This strategy also enables different release cycles for the main CharLS
library and the JS/WASM library.

## CMake SubProject

The main charls library is referenced as a CMake sub project by referencing
it using the add_subdirectory() mechanism:

```cmake
add_subdirectory(extern/charls EXCLUDE_FROM_ALL)
```

This approach allows this library to easily reference/load/link the charls main
project library by re-using its CMakeLists.txt file.  The EXCLUDE_FROM_ALL 
causes it to ignore any build targets not explicitly linked (e.g. the test code
and apps which are not needed by this library).

## EMBIND

The original JS build of CharLS required quite a bit of JavaScript glue
code to use.  This glue code was messy and not packaged with the actual build
itself making it difficult to use.  I discovered [EMBIND](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html)
which solves this problem by allow you to write the JavaScript bridge code
in C++ and expose it via EMBIND.  I used this to create wrapper classes that
handle the encoding, decoding, memory management and access to other properties
such as the nearLossless parameter and interleaveMode.

## Memory Management

WASM code runs in its own sandbox and cannot access memory outside of that
sandbox.  This means that data in JavaScript memory needs to be copied into
WASM memory before the WASM code can use it.  Since decoded images will
typically come from a server, the JPEG-LS encoded bitstream will always be 
in JavaScript memory (e.g. in response to a fetch() to read it from HTTP
server).  The encoded bitstream needs to be copied into WASM space before
it can be decoded since the WASM decoder has no ability to access the
JavaScript memory.  After the decode, the decoded pixels are also in
WASM memory space.  JavaScript can access the decoded pixels directly,
but it may also make sense to copy the pixel data into a canvas image data
structure or some other javascript structure for performance reasons.

Both the encoder and decoder are designed such that instances can be safely
reused accross multiple images.  Using the same instance is recommended as
it will reuse the same underlying buffers and avoid fragmenting the heap -
especially for large high resolution images.