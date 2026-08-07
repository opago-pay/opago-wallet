const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Force Metro to resolve the 'browser' exports in package.json to fix 'jose' Node polyfill errors
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

// Add 'mjs' to handle the uuid ESM resolution issue in the Privy SDK on Web
config.resolver.sourceExts.push('mjs', 'cjs');

// Polyfill the Node stream modules used by ed25519-hd-key's browser build.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  stream: path.dirname(require.resolve('readable-stream/package.json')),
  string_decoder: path.dirname(require.resolve('string_decoder/package.json')),
};

module.exports = config;
