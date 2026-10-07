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

test('P3 binary native requests carry encrypted bytes only on the contracted photo endpoint and never fall back', async () => {
  const payload = Buffer.alloc(29,7).toString('base64'); let captured;
  const transport = nativeTransport({ request: async options => { captured=options; return {status:201,contentType:'application/json',body:'{}'};},cancel:async()=>{} });
  const url='https://example.org/api/v2/onboarding/kyc/00000000-0000-4000-8000-000000000001/documents?revision=1&side=front';
  const options={method:'POST',headers:{'Content-Type':'application/octet-stream','X-Opago-Envelope':'synthetic-encrypted-descriptor'}};
  await transport(url,options,91500,false,{base64:payload,timeoutMs:120000});
  assert.equal(captured.bodyEncoding,'base64');assert.equal(captured.body,payload);assert.equal(captured.timeoutMs,120000);assert.equal(captured.maxBytes,91500);
  await assert.rejects(transport('https://example.org/arbitrary',options,91500,false,{base64:payload,timeoutMs:120000}));
  await assert.rejects(nativeTransport(null)(url,options,91500,true,{base64:payload,timeoutMs:120000}),/Secure network transport is unavailable/);
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

test('native Retry-After reaches the activation backoff even for proxy errors', async () => {
  const request = nativeTransport({request: async () => ({status:429,contentType:'text/html',body:'busy',retryAfter:'120'}),cancel:async()=>{}});
  const response = await request('https://hedera-activation.opago.com/v1/challenges', {method:'POST',body:'{}'});
  assert.equal(response.status,429);
  assert.equal(response.headers.get('retry-after'),'120');
});

test('native HKA PUT/DELETE preserve envelopes and fresh-config Cache-Control; read/delete reject bodies', async () => {
  const calls = [];
  const request = nativeTransport({ request: async options => { calls.push(options); return { status: 200, contentType: 'application/json', body: '{}', cacheControl: 'no-store' }; }, cancel: async () => {} });
  const response = await request('https://api.opago.com/api/v2/wallet/address', { method: 'PUT', body: '{"encryption":"hpke-v1"}' });
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(calls[0].method, 'PUT'); assert.ok(calls[0].body);
  await request('https://api.opago.com/api/v2/account', { method: 'DELETE', headers: { 'X-Opago-Envelope': 'synthetic-envelope' } });
  assert.equal(calls[1].method, 'DELETE'); assert.equal(calls[1].body, ''); assert.equal(calls[1].headers['x-opago-envelope'], 'synthetic-envelope');
  await assert.rejects(request('https://api.opago.com/api/v2/account', { method: 'DELETE', body: '{}' }));
  await assert.rejects(request('https://api.opago.com/api/v2/account', { method: 'GET', body: '{}' }));
});


test('native response request ID survives the platform bridge for authenticated v3 validation', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const request = nativeTransport({ request: async () => ({ status: 201, contentType: 'application/json', body: '{}', requestId: id, cacheControl: 'no-store' }), cancel: async () => {} });
  const response = await request('https://example.org/api/v3/report', { method: 'POST', body: '{}' });
  assert.equal(response.headers.get('x-request-id'), id);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
