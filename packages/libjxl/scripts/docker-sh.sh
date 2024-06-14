docker run -it --rm \
  --user $(id -u):$(id -g) \
  -v "$(pwd)":/libjxl-js -w /libjxl-js \
  libjxljsbuild bash -login