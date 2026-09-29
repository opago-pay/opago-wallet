'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { updateSource } = require('../scripts/patch-react-native-ios-turbomodule.cjs');

const vulnerable = `
void ObjCTurboModule::performVoidMethodInvocation() {
  @try {
    invoke();
  } @catch (NSException *exception) {
    throw convertNSExceptionToJSError(runtime, exception, std::string{moduleName}, methodNameStr);
  }
}
jsi::Value ObjCTurboModule::convertReturnIdToJSIValue() { return {}; }
`;

test('iOS TurboModule patch applies the upstream async-void exception fix exactly once', () => {
  const patched = updateSource(vulnerable);
  assert.match(patched, /@throw exception;/);
  assert.doesNotMatch(patched.slice(patched.indexOf('performVoidMethodInvocation')),
    /throw convertNSExceptionToJSError/);
  assert.equal(updateSource(patched), patched);
});

test('iOS TurboModule patch fails closed when the pinned source shape changes', () => {
  assert.throws(() => updateSource('unrecognized source'), /implementation changed/);
});
