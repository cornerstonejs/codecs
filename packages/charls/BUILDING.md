# Building CharLS-js

CharLS-js utilizes CMake and EMSCRIPTEN for building.  The dependencies used
for this build are as follows:

* CMake 3.16 or better
* Emscripten SDK 1.39.4 or better
* NodeJS 8.9.1 or later (for running test/node)
* Modern browser (for running test/browser)

**earlier versions may work but have not been tested**

## Visual Studio Code Remote Containers Support

This project includes support for building in a docker container using the 
Visual Studio Code Remote - Containers extension.  The configured docker container
includes the correct versions of emscripten, cmake and gcc so you can build, debug
and run this project immediately without having to deal with toolchain dependencies.
The default build task (shift+control+b) is to configure, build and run the tests

NOTE: If you don't use VS Code but want to use Docker, you can try using the 
Dockerfile in the .devcontainer folder.

## Building WASM (requires EMSCRIPTEN)

```bash
build.sh
```

After building, you can run the browser based test by running an http server
at the root of this project and opening the file test/browser/index.html  I use 
[HTTP Server / HTML Preview](https://marketplace.visualstudio.com/items?itemName=Flixs.vs-code-http-server-and-html-preview)

## Build Output

The build script generates two files in the /dist folder:
* charlSjs.wasm - WebAssembly build of CharLS
* charlsjs.js - JavaScript "glue" genereated by EMBIND

## Publishing to NPM

TODO - Add steps to publish 

