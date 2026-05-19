# libjpeg-turbojs

JS/WASM Build of [libjpeg-turbo](https://github.com/libjpeg-turbo).

## Try It Out

Try it in your browser [here](https://chafey.github.com/libjpeg-turbojs/test/browser/index.html).

## Testing

```bash
yarn run build   # compile wasm into dist/
yarn run test    # run vitest against dist/
```

Tests skip cleanly when `dist/` is absent, so a clean clone won't fail before the
first build.
