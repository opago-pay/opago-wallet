'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Base64 } = require('js-base64');
const { updateTransport, esmBody } = require('../scripts/patch-spark-xhr-transport.cjs');

function bundle(ext) {
  return fs.readFileSync(path.join(__dirname, '..', 'node_modules', '@buildonspark',
    'spark-sdk', 'dist', 'native', `index.react-native.${ext}`), 'utf8');
}

function fixture(ext) {
  const source = bundle(ext);
  const start = source.indexOf('async function xhrPost(');
  const end = source.indexOf('function concatenateChunks(', start);
  assert.ok(start >= 0 && end > start);
  let instance;
  class XMLHttpRequest {
    static HEADERS_RECEIVED = 2;
    constructor() { instance = this; this.status = 200; this.response = new Uint8Array([42]).buffer; this.headers = []; }
    open() {}
    setRequestHeader(name, value) { this.headers.push([name, value]); }
    send() { this.sent = true; }
    abort() { this.aborted = true; this.onabort?.(); }
    getAllResponseHeaders() { return 'content-type: application/grpc'; }
  }
  class GrpcCallData { responseHeaders = null; responseChunks = []; grpcStatus = null; }
  const name = ext === 'cjs' ? 'js_base64' : 'Base64';
  const binding = ext === 'cjs' ? { Base64 } : Base64;
  const xhrPost = new Function('XMLHttpRequest', 'GrpcCallData', name,
    'headersToMetadata', 'getStatusFromHttpCode', 'getErrorDetailsFromHttpResponse',
    source.slice(start, end) + '\nreturn xhrPost;')(
    XMLHttpRequest, GrpcCallData, binding, value => ({ raw: value }),
    status => status === 200 ? 0 : 2, () => 'Network error');
  return { xhrPost, current: () => instance };
}

for (const ext of ['cjs', 'js']) {
  test(`Spark ${ext} sends text and binary metadata and retains successful response bytes`, async () => {
    const f = fixture(ext);
    const pending = f.xhrPost('https://synthetic.example', [
      ['content-type', ['application/grpc']], ['test-bin', [new Uint8Array([1, 2])]],
    ], new Uint8Array([3]), {});
    assert.deepEqual(f.current().headers,
      [['content-type', 'application/grpc'], ['test-bin', 'AQI=']]);
    assert.equal(f.current().sent, true);
    assert.equal(f.current().timeout, 45_000);
    f.current().readyState = f.current().constructor.HEADERS_RECEIVED;
    f.current().onreadystatechange();
    f.current().onload();
    const result = await pending;
    assert.equal(result.grpcStatus, 0);
    assert.deepEqual(Array.from(result.responseChunks[0]), [42]);
    assert.match(result.responseHeaders.raw, /application\/grpc/);
  });

  test(`Spark ${ext} rejects network errors, timeouts and aborts`, async () => {
    for (const failure of ['network', 'timeout', 'abort']) {
      const f = fixture(ext);
      const controller = new AbortController();
      const pending = f.xhrPost('https://synthetic.example', [], new Uint8Array(), {}, controller.signal);
      if (failure === 'network') f.current().onerror();
      if (failure === 'timeout') f.current().ontimeout();
      if (failure === 'abort') controller.abort();
      await assert.rejects(pending, failure === 'network' ? /Network error/ :
        failure === 'timeout' ? /timed out/ : /aborted/);
      if (failure === 'abort') assert.equal(f.current().aborted, true);
    }
  });
}

test('strict patch check detects stale V1 ESM body and installer repairs it', () => {
  const relative = 'dist/native/index.react-native.js';
  const current = bundle('js');
  const stale = current.replace('OPAGO_XHR_ABORT_TIMEOUT_V2', 'OPAGO_XHR_ABORT_TIMEOUT_V1')
    .replace('Base64.fromUint8Array(value)', 'js_base64.Base64.fromUint8Array(value)');
  assert.notEqual(stale, current);
  assert.throws(() => updateTransport(stale, esmBody, relative, true), /not patched/);
  const repaired = updateTransport(stale, esmBody, relative, false);
  assert.equal(repaired, current);
  assert.equal(updateTransport(repaired, esmBody, relative, true), current);
});
