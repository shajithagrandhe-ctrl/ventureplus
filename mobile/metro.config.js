const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, "../shared")];
// Shared source consumes dependencies owned and locked by the mobile app.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  ...config.resolver.nodeModulesPaths,
];
module.exports = config;
