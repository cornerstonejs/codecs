const HtmlWebPackPlugin = require('html-webpack-plugin')

module.exports = (env, argv) => {

    const {isProdBuild} = env;
    return {
        mode: isProdBuild ? 'production':  'development' ,
        entry: {
            app: './app.js'
        },
        output: {
            filename: isProdBuild ? '[name].[hash].js': '[name].js'
        },
        module: {
            rules: [
                {
                    test: /\.jsx?$/,
                    loader: 'babel-loader',
                    exclude: /node_modules/
                }
            ]
        },
        resolve: {
            extensions: ['.js', '.jsx']
        },
        plugins: [
            new HtmlWebPackPlugin({
                template: './test/browser/index.html',
                filename: './index.html'
            })
        ]
    }
}