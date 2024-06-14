# libjxl-js
JS/WASM build of libjxl (JPEG-XL)

## Try It Out!

Try it in your browser [here](https://chafey.github.io/libjxl-js/test/browser/index.html)

## Building

This project uses git submodules to pull in libjxl.  If developing, initialize the git submodules first:

```
> git submodule update --init --recursive
```

This project uses Docker to provide a consistent developer environment.

Create docker container 'libjxljsbuild'

```
> scripts/docker-build.sh
```

Create shell inside libjxljsbuild container:

```
> scripts/docker-sh.sh
```

Install node 16 (inside docker shell):
```
> nvm install 16
```

To build WASM (inside docker shell):
```
> scripts/wasm-build.sh
```

To build native C/C++ version (inside docker shell):
```
> scripts/native-build.sh
```

Run performance test (inside docker shell):
```
> scripts/performance.sh
```

## NOTES

Luca's suggestions for cjxl parameters to use for progressive lossless encoding

* ./tools/cjxl -P 0 -R 1 -I 0 -s 4 -g 0 in.png out.jxl