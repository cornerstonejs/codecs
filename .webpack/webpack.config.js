const path = require('path');
// const transpileJavaScriptRule = require('./rules/transpileJavaScript.js');
// const TerserJSPlugin = require('terser-webpack-plugin');
const dotenv = require('dotenv');
const NODE_ENV = process.env.NODE_ENV;

//
dotenv.config();

module.exports = (env, argv, { SRC_DIR, DIST_DIR }) => {
  if (!process.env.NODE_ENV) {
    throw new Error('process.env.NODE_ENV not set');
  }

  const mode = NODE_ENV === 'production' ? 'production' : 'development';
  const isProdBuild = NODE_ENV === 'production';

  const config = {
    mode: isProdBuild ? 'production' : 'development',
    devtool: isProdBuild ? 'source-map' : 'cheap-module-eval-source-map',
    entry: {
      app: `${SRC_DIR}/index.js`,
    },
    output: {
      path: DIST_DIR,
    },
    optimization: {
      minimize: isProdBuild,
      sideEffects: true,
    },
    context: SRC_DIR,
    module: {
      rules: [
        {
          test: /\.js$/,
          loader: 'babel-loader',
          options: {
            // Find babel.config.js in monorepo root
            // https://babeljs.io/docs/en/options#rootmode
            rootMode: 'upward',
            envName: mode,
          },
        },
      ],
    },
    resolve: {
      // Which directories to search when resolving modules
      modules: [
        // Modules specific to this package
        path.resolve(__dirname, '../node_modules'),
        // Hoisted Yarn Workspace Modules
        path.resolve(__dirname, '../../node_modules'),
        SRC_DIR,
      ],
      // Attempt to resolve these extensions in order.
      extensions: ['.js', '.jsx', '.json', '*'],
      // symlinked resources are resolved to their real path, not their symlinked location
      symlinks: true,
    },
    // Fix: https://github.com/webpack-contrib/css-loader/issues/447#issuecomment-285598881
    // For issue in cornerstone-wado-image-loader
    // node: {
    //   fs: 'empty',
    // },
  };

  // if (isProdBuild) {
  //   config.optimization.minimizer = [
  //     new TerserJSPlugin({
  //       // Supports: source-map and inline-source-map
  //       sourceMap: isProdBuild,
  //       parallel: true,
  //       terserOptions: {},
  //     }),
  //   ];
  // }

  return config;
};
