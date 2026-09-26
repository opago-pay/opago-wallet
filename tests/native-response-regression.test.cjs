'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
// React Native's global Response is supplied by this installed package.
const rnFetch = require('whatwg-fetch');

const repo = path.join(__dirname, '..');

function load(relativePath, dependencies, ResponseType = rnFetch.Response,
  HeadersType = rnFetch.Headers) {
  const source = fs.readFileSync(path.join(repo, relativePath), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'navigator', 'Response', 'Headers', code)(
    name => {
      if (name in dependencies) return dependencies[name];
      throw new Error('Unexpected dependency: ' + name);
    }, exports, { product: 'ReactNative' }, ResponseType, HeadersType);
  return exports;
}

function fixture(reply, { session, modulePresent = true } = {}) {
  let bridgeCalls = 0;
  let cancelCalls = 0;
  const native = modulePresent ? {
    request: async options => { bridgeCalls++; return reply(options); },
    cancel: async () => { cancelCalls++; },
  } : null;
  const config = {
    appConfig: { allowInsecureHttp: false },
    assertSafeRemoteUrl: value => new URL(value),
  };
  const transport = load('lib/strict-http-transport.ts', {
    './config': config,
    './wallet-session': { walletSession: session || { subscribe: () => () => {} } },
    'expo-modules-core': { requireOptionalNativeModule: () => native },
  });
  const http = load('lib/http.ts', {
    './config': config,
    './strict-http-transport': transport,
  });
  return { ...transport, ...http, bridgeCalls: () => bridgeCalls, cancelCalls: () => cancelCalls };
}

test('React Native Response has no stream, yet bounded native JSON reaches fetchJson', async () => {
  assert.equal(new rnFetch.Response('{}', { status: 200 }).body, undefined);
  const app = fixture(async () => ({ status: 200, contentType: 'application/json',
    body: '{"bitcoin":{"eur":60000}}' }));
  const result = await app.fetchJson('https://example.org/api', {}, { purpose: 'Controlled test' });
  assert.equal(result.bitcoin.eur, 60000);
  assert.equal(app.bridgeCalls(), 1);
});

test('bounded native text preserves UTF-8, status and content type', async () => {
  const app = fixture(async () => ({ status: 202, contentType: 'text/plain; charset=utf-8', body: 'Café €' }));
  const response = await app.strictFetch('https://example.org/text', {}, 64);
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await app.readBoundedText(response, 'Controlled text', 20, new AbortController(), 64), 'Café €');
});

test('native HTTP errors and malformed JSON remain errors after bounded reading', async () => {
  const httpError = fixture(async () => ({ status: 503, contentType: 'application/json',
    body: '{"reason":"Provider unavailable"}' }));
  await assert.rejects(httpError.fetchJson('https://example.org/api', {}, { purpose: 'Controlled test' }),
    /Provider unavailable/);

  const malformed = fixture(async () => ({ status: 200, contentType: 'application/json', body: '{broken' }));
  await assert.rejects(malformed.fetchJson('https://example.org/api', {}, { purpose: 'Controlled test' }),
    /invalid JSON/);

  const wrongType = fixture(async () => ({ status: 200, contentType: 'text/html', body: '{}' }));
  await assert.rejects(wrongType.fetchJson('https://example.org/api', {}, { purpose: 'Controlled test' }),
    /unexpected content type/);
});

test('consumer character and native byte ceilings still reject oversized responses', async () => {
  const tooLong = fixture(async () => ({ status: 200, contentType: 'application/json', body: '{"a":"long"}' }));
  await assert.rejects(tooLong.fetchJson('https://example.org/api', {}, {
    purpose: 'Controlled test', maxResponseChars: 8,
  }), /oversized response/);

  // A buggy bridge fixture cannot bypass the cap that strictFetch requested.
  const tooManyBytes = fixture(async () => ({ status: 200, contentType: 'text/plain', body: '€€' }));
  const response = await tooManyBytes.strictFetch('https://example.org/text', {}, 4);
  const controller = new AbortController();
  await assert.rejects(tooManyBytes.readBoundedText(response, 'Controlled text', 10, controller, 10),
    /oversized response/);
  assert.equal(controller.signal.aborted, true);
});

test('an unmarked React Native response cannot use the bounded bridge exception', async () => {
  const app = fixture(async () => ({ status: 200, contentType: 'text/plain', body: '' }));
  await assert.rejects(app.readBoundedText(new rnFetch.Response('unsafe'),
    'Controlled text', 20, new AbortController()), /unreadable response/);
  await assert.rejects(fixture(async () => ({}), { modulePresent: false })
    .strictFetch('https://example.org/api', {}), /Secure network transport is unavailable/);
});

test('abort and wallet change discard a late native result', async () => {
  let resolveRequest;
  let walletChanged;
  const app = fixture(() => new Promise(resolve => { resolveRequest = resolve; }), {
    session: { subscribe(listener) { walletChanged = listener; return () => {}; } },
  });
  const pending = app.strictFetch('https://example.org/api', {});
  await Promise.resolve();
  walletChanged();
  resolveRequest({ status: 200, contentType: 'application/json', body: '{}' });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(app.cancelCalls(), 1);

  let resolveOther;
  const second = fixture(() => new Promise(resolve => { resolveOther = resolve; }));
  const controller = new AbortController();
  const requested = second.fetchJson('https://example.org/api', { signal: controller.signal },
    { purpose: 'Controlled test' });
  await Promise.resolve();
  controller.abort();
  resolveOther({ status: 200, contentType: 'application/json', body: '{}' });
  await assert.rejects(requested, /timed out/);
  assert.equal(second.cancelCalls(), 1);
});
