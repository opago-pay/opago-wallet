'use strict';

// SDK 0.7.12's React Native XHR transport ignores AbortSignal and can wait
// forever. Patch both published native bundles and the matching source after
// every install; refuse a different SDK or an unrecognized transport shape.
const fs = require('node:fs');
const path = require('node:path');
const sdkRoot = path.join(__dirname, '..', 'node_modules', '@buildonspark', 'spark-sdk');
const version = JSON.parse(fs.readFileSync(path.join(sdkRoot, 'package.json'), 'utf8')).version;
if (version !== '0.7.12') throw new Error(`Review Spark XHR transport before using SDK ${version}.`);

const marker = 'OPAGO_XHR_ABORT_TIMEOUT_V2';
const jsBody = `async function xhrPost(url, metadata, requestBody, config, signal) {
  // ${marker}: bound native requests and propagate cancellation.
  const callData = new GrpcCallData();
  return new Promise(function(resolve, reject) {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const abort = () => xhr.abort();
    const finish = (error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(callData);
    };
    if (signal?.aborted) { finish(new Error("Spark request aborted.")); return; }
    signal?.addEventListener("abort", abort, { once: true });
    try {
      xhr.open("POST", url, true);
      xhr.withCredentials = config?.credentials ?? true;
      xhr.responseType = "arraybuffer";
      xhr.timeout = 45_000;
      for (const [key, values] of metadata) for (const value of values) xhr.setRequestHeader(key, typeof value === "string" ? value : js_base64.Base64.fromUint8Array(value));
      xhr.onreadystatechange = function() {
        if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) callData.responseHeaders = headersToMetadata(xhr.getAllResponseHeaders());
      };
      xhr.onload = function() {
        callData.responseChunks.push(new Uint8Array(xhr.response || new ArrayBuffer(0)));
        callData.grpcStatus = getStatusFromHttpCode(xhr.status);
        finish();
      };
      xhr.onerror = () => finish(new Error(getErrorDetailsFromHttpResponse(xhr.status, xhr.statusText)));
      xhr.ontimeout = () => finish(new Error("Spark request timed out."));
      xhr.onabort = () => finish(new Error("Spark request aborted."));
      xhr.send(requestBody);
    } catch (error) { finish(error); }
  });
}
`;
const tsBody = `async function xhrPost(
  url: string,
  metadata: Metadata,
  requestBody: BodyInit,
  config?: XHRTransportConfig,
  signal?: AbortSignal,
): Promise<GrpcCallData> {
  // ${marker}: bound native requests and propagate cancellation.
  const callData = new GrpcCallData();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const abort = () => xhr.abort();
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(callData);
    };
    if (signal?.aborted) { finish(new Error("Spark request aborted.")); return; }
    signal?.addEventListener("abort", abort, { once: true });
    try {
      xhr.open("POST", url, true);
      xhr.withCredentials = config?.credentials ?? true;
      xhr.responseType = "arraybuffer";
      xhr.timeout = 45_000;
      for (const [key, values] of metadata) for (const value of values) {
        xhr.setRequestHeader(key, typeof value === "string" ? value : Base64.fromUint8Array(value));
      }
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
          callData.responseHeaders = headersToMetadata(xhr.getAllResponseHeaders());
        }
      };
      xhr.onload = () => {
        callData.responseChunks.push(new Uint8Array(xhr.response || new ArrayBuffer(0)));
        callData.grpcStatus = getStatusFromHttpCode(xhr.status);
        finish();
      };
      xhr.onerror = () => finish(new Error(getErrorDetailsFromHttpResponse(xhr.status, xhr.statusText)));
      xhr.ontimeout = () => finish(new Error("Spark request timed out."));
      xhr.onabort = () => finish(new Error("Spark request aborted."));
      // @ts-ignore React Native accepts Uint8Array request bodies.
      xhr.send(requestBody);
    } catch (error) { finish(error); }
  });
}
`;
const esmBody = jsBody.replace('js_base64.Base64.fromUint8Array(value)', 'Base64.fromUint8Array(value)');

function updateTransport(source, body, relative, check) {
  const start = source.indexOf('async function xhrPost(');
  const end = source.indexOf('function concatenateChunks(', start);
  const existingBody = source.slice(start, end);
  if (start < 0 || end < 0 || end <= start || !existingBody.includes('xhr.send(requestBody)')) {
    throw new Error(`Spark XHR transport changed in ${relative}.`);
  }
  const call = 'xhrPost(url, metadata, requestBody, config)';
  const patchedCall = 'xhrPost(url, metadata, requestBody, config, signal)';
  if (check) {
    if (existingBody !== body || !source.includes('await ' + patchedCall) || source.includes('await ' + call)) {
      throw new Error(`Spark XHR transport is not patched in ${relative}.`);
    }
    return source;
  }
  if (existingBody === body && source.includes('await ' + patchedCall) && !source.includes('await ' + call)) return source;
  if (!source.includes(call) && !source.includes('await ' + patchedCall)) {
    throw new Error(`Spark XHR invocation changed in ${relative}.`);
  }
  if (existingBody.includes('OPAGO_XHR_ABORT_TIMEOUT_') &&
      !existingBody.includes('OPAGO_XHR_ABORT_TIMEOUT_V1') && !existingBody.includes(marker)) {
    throw new Error(`Spark XHR patch version is unknown in ${relative}.`);
  }
  const patched = source.slice(0, start) + body + source.slice(end);
  return source.includes('await ' + call) ? patched.replace(call, patchedCall) : patched;
}

if (require.main === module) {
  for (const [relative, body] of [
    ['src/services/xhr-transport.ts', tsBody],
    ['dist/native/index.react-native.cjs', jsBody],
    ['dist/native/index.react-native.js', esmBody],
  ]) {
    const target = path.join(sdkRoot, relative);
    const source = fs.readFileSync(target, 'utf8');
    const updated = updateTransport(source, body, relative, process.argv.includes('--check'));
    if (updated !== source) fs.writeFileSync(target, updated);
  }
  process.stdout.write('Spark React Native XHR timeout and abort check passed.\n');
}

module.exports = { updateTransport, tsBody, jsBody, esmBody };
