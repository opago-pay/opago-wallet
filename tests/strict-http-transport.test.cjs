'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('./register-typescript.cjs');
const { readBoundedText } = require('../lib/strict-http-transport.ts');

function nativeTransport(module, session = { subscribe: () => () => {} }) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib/strict-http-transport.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'navigator', code)(id => {
    if (id === './config') return { appConfig: { allowInsecureHttp: false } };
    if (id === './wallet-session') return { walletSession: session };
    if (id === 'expo-modules-core') return { requireOptionalNativeModule: () => module };
    if (id === 'expo/fetch') throw new Error('Unsafe fallback must not be loaded.');
    throw new Error('Unexpected dependency: ' + id);
  }, exports, { product: 'ReactNative' });
  return exports.strictFetch;
}

test('native JSON requests use the bounded native transport and never fall back to fetch', async () => {
  let called = false;
  const strictFetch = nativeTransport({
    request: async ({ url, method, maxBytes, timeoutMs, allowPrivateDevelopment, requestId }) => {
      called = true;
      assert.equal(url, 'https://example.org/api');
      assert.equal(method, 'GET');
      assert.equal(maxBytes, 2_097_152);
      assert.equal(timeoutMs, 12_000);
      assert.equal(allowPrivateDevelopment, false);
      assert.match(requestId, /^\d+$/);
      return { status: 200, contentType: 'application/json', body: '{}' };
    },
    cancel: async () => {},
  });
  await strictFetch('https://example.org/api', { redirect: 'follow' });
  assert.equal(called, true);
});

test('untrusted native requests fail closed when the peer-bound module is absent', async () => {
  await assert.rejects(nativeTransport(null)('https://example.org/api', {}),
    /Secure network transport is unavailable/);
});

test('locking cancels an in-flight native request', async () => {
  let rejectRequest;
  let cancelCount = 0;
  let lock;
  const strictFetch = nativeTransport({
    request: () => new Promise((_, reject) => { rejectRequest = reject; }),
    cancel: async () => { cancelCount++; rejectRequest(new Error('Secure network request failed.')); },
  }, { subscribe(listener) { lock = listener; return () => {}; } });
  const request = strictFetch('https://example.org/api', {});
  await Promise.resolve();
  lock();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(cancelCount, 1);
});

test('streamed response stops on excess bytes even without Content-Length', async () => {
  const controller = new AbortController();
  let canceled = false;
  const response = new Response(new ReadableStream({
    start(stream) {
      stream.enqueue(new TextEncoder().encode('1234'));
      stream.enqueue(new TextEncoder().encode('56789'));
    },
    cancel() { canceled = true; },
  }));
  await assert.rejects(readBoundedText(response, 'Test endpoint', 8, controller, 8), /oversized response/);
  assert.equal(controller.signal.aborted, true);
  assert.equal(canceled, true);
});

test('bounded stream preserves UTF-8 split across chunks and rejects a false short Content-Length', async () => {
  const encoded = new TextEncoder().encode('é');
  const response = new Response(new ReadableStream({
    start(stream) {
      stream.enqueue(encoded.slice(0, 1));
      stream.enqueue(encoded.slice(1));
      stream.close();
    },
  }), { headers: { 'content-length': '1' } });
  assert.equal(await readBoundedText(response, 'Test endpoint', 1, new AbortController(), 2), 'é');
});
