'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Base64 } = require('js-base64');
const grpc = require('nice-grpc-common');

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
    static HEADERS_RECEIVED = 2; static DONE = 4;
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
    'NoopLogger', 'nice_grpc_common', 'Status', 'ClientError',
    source.slice(start, end) + '\nreturn xhrPost;')(
    XMLHttpRequest, GrpcCallData, binding, value => ({ raw: value }),
    status => status === 200 ? 0 : 2, () => 'Network error', {}, grpc, grpc.Status, grpc.ClientError);
  return { xhrPost, current: () => instance };
}

for (const ext of ['cjs', 'js']) {
  test(`Spark ${ext} sends text and binary metadata and retains successful response bytes`, async () => {
    const f = fixture(ext);
    const pending = f.xhrPost('https://synthetic.example', [
      ['content-type', ['application/grpc']], ['test-bin', [new Uint8Array([1, 2])]],
    ], new Uint8Array([3]), {}, undefined, undefined, 60000);
    assert.deepEqual(f.current().headers,
      [['content-type', 'application/grpc'], ['test-bin', 'AQI=']]);
    assert.equal(f.current().sent, true);
    assert.equal(f.current().timeout, 60000);
    f.current().readyState = f.current().constructor.HEADERS_RECEIVED;
    f.current().onreadystatechange();
    f.current().readyState = 4; f.current().onreadystatechange(); f.current().onloadend();
    const result = await pending;
    assert.equal(result.grpcStatus, 0);
    assert.deepEqual(Array.from(result.responseChunks[0]), [42]);
    assert.match(result.responseHeaders.raw, /application\/grpc/);
  });

  test(`Spark ${ext} preserves network error, timeout and abort status`, async () => {
    for (const failure of ['network', 'timeout', 'abort']) {
      const f = fixture(ext);
      const controller = new AbortController();
      const pending = f.xhrPost('https://synthetic.example', [], new Uint8Array(), {}, undefined, controller.signal, 60000);
      if (failure === 'network') { f.current().onerror(); f.current().readyState = 4; f.current().onreadystatechange(); }
      if (failure === 'timeout') f.current().ontimeout();
      if (failure === 'abort') controller.abort();
      f.current().onloadend(); // late completion must not overwrite failure
      const result = await pending;
      assert.equal(result.grpcStatus, failure === 'network' ? grpc.Status.UNKNOWN : failure === 'timeout' ? grpc.Status.DEADLINE_EXCEEDED : grpc.Status.CANCELLED);
      if (failure === 'abort') assert.equal(f.current().aborted, true);
    }
  });
}

for (const ext of ['cjs', 'js']) {
  test(`Spark ${ext} pre-aborted request is never sent`, async () => {
    const f = fixture(ext); const controller = new AbortController(); controller.abort();
    const result = await f.xhrPost('https://synthetic.example', [], new Uint8Array(), {}, undefined, controller.signal, 60000);
    assert.equal(f.current().sent, undefined); assert.equal(result.grpcStatus, grpc.Status.CANCELLED);
  });
}
