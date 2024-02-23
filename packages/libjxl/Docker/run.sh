docker run -it --rm \
  -v $HOME/src/github/chafey/libjxl-js:/libjxl-js -w /libjxl-js \
  emscripten/emsdk:3.1.54 bash