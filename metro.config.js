const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const queryStringBridge = path.join(__dirname, 'lib/router-query-string.cjs');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'query-string' && path.normalize(context.originModulePath) !== path.normalize(queryStringBridge)) {
    return { type: 'sourceFile', filePath: queryStringBridge };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Force Metro to resolve the 'browser' exports in package.json to fix 'jose' Node polyfill errors
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

// Resolve packages that publish modern ESM or CommonJS entry points.
config.resolver.sourceExts.push('mjs', 'cjs');

// Polyfill the Node stream modules used by ed25519-hd-key's browser build.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  stream: path.dirname(require.resolve('readable-stream/package.json')),
  string_decoder: path.dirname(require.resolve('string_decoder/package.json')),
};

module.exports = config;
