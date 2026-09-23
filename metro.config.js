const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const queryStringBridge = path.join(__dirname, 'lib/router-query-string.cjs');

// Expo CLI's dev-server file observers still read `eventsQueue`, while the
// pinned Metro file map now emits `changes`. Keep both shapes available so a
// watched file cannot crash Metro after the Android app connects.
const MetroFileMap = require('metro-file-map').default;
const emitFileMapEvent = MetroFileMap.prototype.emit;
MetroFileMap.prototype.emit = function (event, payload, ...rest) {
  if (event === 'change' && payload?.changes && !payload.eventsQueue) {
    const eventsQueue = [];
    for (const [filePath, metadata] of payload.changes.addedFiles) {
      eventsQueue.push({ type: 'add', filePath: path.resolve(payload.rootDir, filePath), metadata });
    }
    for (const [filePath, metadata] of payload.changes.modifiedFiles) {
      eventsQueue.push({ type: 'change', filePath: path.resolve(payload.rootDir, filePath), metadata });
    }
    for (const filePath of payload.changes.removedFiles) {
      eventsQueue.push({ type: 'delete', filePath: path.resolve(payload.rootDir, filePath) });
    }
    payload = { ...payload, eventsQueue };
  }
  return emitFileMapEvent.call(this, event, payload, ...rest);
};

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
