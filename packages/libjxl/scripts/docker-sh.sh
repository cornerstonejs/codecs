docker run -it --rm \
  --user $(id -u):$(id -g) \
  -v ".":/workspaces/libjxl-js -w /workspaces/libjxl-js \
  libjxljsbuild bash -login