const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const isDev = process.env.NODE_ENV !== 'production';

module.exports = {
  mode: isDev ? 'development' : 'production',
  entry: './src/renderer/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true,
  },
  devtool: isDev ? 'inline-source-map' : false,
  devServer: {
    historyApiFallback: true,
    static: [
      {
        directory: path.resolve(__dirname, 'dist'),
      },
      {
        // Serving the directory that contains the worker file
        directory: path.resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build'),
        publicPath: '/',
      },
    ],
    hot: true,
    port: 3000,
  },
  resolve: {
    extensions: ['.js', '.jsx', '.mjs'],
  },
  module: {
    rules: [
      {
        test: /\.(jsx?|mjs)$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
    new CopyWebpackPlugin({
      patterns: [
        // --- THIS IS THE KEY CHANGE ---
        {
          // Using the most likely correct path for the .mjs file
          from: 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
          to: '.',
        },
      ],
    }),
  ],
};