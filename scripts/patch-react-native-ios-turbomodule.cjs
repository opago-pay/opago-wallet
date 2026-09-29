'use strict';

// React Native 0.81.5 converts NSException to a JSError from the native
// invoker thread for async void TurboModule calls. Hermes' runtime is not
// thread-safe, so that conversion can terminate release builds on iOS 26.
// Apply the upstream React Native fix from facebook/react-native#56265 on
// every clean install and fail closed if the pinned source shape changes.
const fs = require('node:fs');
const path = require('node:path');

const marker = 'void ObjCTurboModule::performVoidMethodInvocation(';
const nextMethod = 'jsi::Value ObjCTurboModule::convertReturnIdToJSIValue(';
const vulnerable = 'throw convertNSExceptionToJSError(runtime, exception, std::string{moduleName}, methodNameStr);';
const replacement = [
  '// Void methods are always async, re-throw instead of converting to',
  '// JSError, same as the async branch in performMethodInvocation.',
  '@throw exception;',
].join('\n      ');

function updateSource(source) {
  const start = source.indexOf(marker);
  const end = source.indexOf(nextMethod, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('React Native iOS TurboModule implementation changed; review the iOS 26 fix.');
  }
  const method = source.slice(start, end);
  if (method.includes('@throw exception;') && !method.includes(vulnerable)) return source;
  const occurrence = method.indexOf(vulnerable);
  if (occurrence < 0 || method.indexOf(vulnerable, occurrence + 1) >= 0) {
    throw new Error('React Native iOS void-method exception handling changed; review the iOS 26 fix.');
  }
  const absolute = start + occurrence;
  return source.slice(0, absolute) + replacement + source.slice(absolute + vulnerable.length);
}

function patchInstalledReactNative(check = false) {
  const reactNativeRoot = path.join(__dirname, '..', 'node_modules', 'react-native');
  const version = JSON.parse(fs.readFileSync(path.join(reactNativeRoot, 'package.json'), 'utf8')).version;
  if (version !== '0.81.5') {
    throw new Error(`Review the iOS TurboModule exception fix before using React Native ${version}.`);
  }
  const target = path.join(reactNativeRoot, 'ReactCommon', 'react', 'nativemodule', 'core',
    'platform', 'ios', 'ReactCommon', 'RCTTurboModule.mm');
  const source = fs.readFileSync(target, 'utf8');
  const updated = updateSource(source);
  if (check && updated !== source) throw new Error('React Native iOS TurboModule fix is not installed.');
  if (updated !== source) fs.writeFileSync(target, updated);
  process.stdout.write('React Native iOS TurboModule exception fix verified.\n');
}

if (require.main === module) patchInstalledReactNative(process.argv.includes('--check'));

module.exports = { updateSource };
