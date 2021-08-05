// ~~ WebPack
const webpack = require('webpack');
const path = require('path');
const merge = require('webpack-merge');
const webpackBase = require('./../../.webpack/webpack.config.js');
// ~~ Plugins
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
// const
const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');

module.exports = (env, argv) => {
  const baseConfig = webpackBase(env, argv, { SRC_DIR, DIST_DIR });

  const mergedConfig = merge(baseConfig, {
    entry: {
      app: `${SRC_DIR}/index-umd.js`,
    },
    output: {
      path: DIST_DIR,
      library: 'OHIFViewer',
      libraryTarget: 'umd',
      filename: 'index.umd.js',
    },
    plugins: [
      // Clean output.path
      new CleanWebpackPlugin(),
    //   new webpack.optimize.LimitChunkCountPlugin({
    //     maxChunks: 1,
    //   }),
    ],
  });

  return mergedConfig;
};