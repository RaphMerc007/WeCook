const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
	entry: {
		background: "./src/background.js",
		content: "./src/content.js",
		popup: "./src/popup.js",
		"webapp-bridge": "./src/webapp-bridge.js",
	},
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "[name].js",
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				use: {
					loader: "babel-loader",
					options: {
						presets: ["@babel/preset-env"],
					},
				},
			},
		],
	},
	plugins: [
		new CopyPlugin({
			patterns: [
				{ from: "src/popup.html", to: "popup.html" },
				{ from: "src/icons", to: "icons" },
				{ from: "manifest.json", to: "manifest.json" },
			],
		}),
	],
};
