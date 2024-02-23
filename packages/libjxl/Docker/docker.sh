docker run -it --rm \
  --user $(id -u):$(id -g) \
  -v $HOME/src/github/chafey/libjxl-js:/libjxl-js -w /libjxl-js \
  jxlbuild bash
