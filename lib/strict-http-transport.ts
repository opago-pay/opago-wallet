import { appConfig } from './config';
import { walletSession } from './wallet-session';

type NativeResponse = { status: number; contentType: string; body: string };
type NativeTransport = {
  request(options: { url: string; method: string; headers: Record<string, string>; body: string;
    maxBytes: number; timeoutMs: number; allowPrivateDevelopment: boolean; requestId: string }): Promise<NativeResponse>;
  cancel(requestId: string): Promise<void>;
};

let nextRequestId = 0;
// Only responses created from the peer-checked, byte-limited native bridge
// may be read through React Native's non-streaming Response.text().
const boundedNativeResponses = new WeakMap<Response, number>();

// Untrusted URLs never fall back to Expo/global fetch on a native device.
function isNativeRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

function aborted(): Error {
  return Object.assign(new Error('Request aborted.'), { name: 'AbortError' });
}

export async function strictFetch(url: string, init: RequestInit, maxBytes = 2_097_152,
  trustedFixedOrigin = false): Promise<Response> {
  if (!isNativeRuntime()) return globalThis.fetch(url, { ...init, redirect: 'error' });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const native: NativeTransport | null = require('expo-modules-core').requireOptionalNativeModule('OpagoSafeHttp');
  if (!native) {
    if (trustedFixedOrigin) {
      // Compatibility only for fixed provider origins when the iOS module is absent.
      // QR/LNURL/OCP-controlled URLs never receive this exception.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('expo/fetch').fetch(url, { ...init, redirect: 'error' });
    }
    throw new Error('Secure network transport is unavailable on this device.');
  }
  const method = (init.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') throw new Error('Unsupported secure request method.');
  if (init.body != null && typeof init.body !== 'string') throw new Error('Unsupported secure request body.');
  if (init.signal?.aborted) throw aborted();
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
  const requestId = String(++nextRequestId);
  let wasAborted = false;
  const onAbort = () => {
    wasAborted = true;
    void native.cancel(requestId).catch(() => {});
  };
  init.signal?.addEventListener('abort', onAbort, { once: true });
  // A lock, unlock or wallet replacement invalidates the in-flight request.
  const unsubscribeSession = walletSession.subscribe(onAbort);
  try {
    if (init.signal?.aborted) throw aborted();
    const result = await native.request({ url, method, headers, body: (init.body as string) || '',
      maxBytes, timeoutMs: 12_000, allowPrivateDevelopment: appConfig.allowInsecureHttp, requestId });
    if (wasAborted) throw aborted();
    if (!Number.isInteger(result.status) || result.status < 100 || result.status > 599 ||
      typeof result.body !== 'string' || typeof result.contentType !== 'string') {
      throw new Error('Secure network transport returned an invalid response.');
    }
    const response = new Response(result.body, {
      status: result.status,
      headers: { 'content-type': result.contentType },
    });
    boundedNativeResponses.set(response, maxBytes);
    return response;
  } catch (error) {
    if (wasAborted) throw aborted();
    throw error;
  } finally {
    unsubscribeSession();
    init.signal?.removeEventListener('abort', onAbort);
  }
}

export async function readBoundedText(
  response: Response,
  purpose: string,
  maxChars: number,
  controller: AbortController,
  maxBytes = maxChars * 4,
): Promise<string> {
  if (controller.signal.aborted) throw aborted();
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > maxBytes) {
    controller.abort();
    throw new Error(purpose + ' returned an oversized response.');
  }

  const nativeLimit = boundedNativeResponses.get(response);
  if (nativeLimit !== undefined) {
    // The Android bridge already enforced nativeLimit on the decoded stream
    // before returning this string. Keep the consumer's tighter limits too.
    const text = await response.text();
    if (controller.signal.aborted) throw aborted();
    if (text.length > maxChars || text.length > maxBytes || text.length > nativeLimit ||
      new TextEncoder().encode(text).byteLength > Math.min(maxBytes, nativeLimit)) {
      controller.abort();
      throw new Error(purpose + ' returned an oversized response.');
    }
    return text;
  }

  // Web fetch may expose only text(); every other native response must stream.
  if (!response.body) {
    if (isNativeRuntime()) throw new Error(purpose + ' returned an unreadable response.');
    const text = await response.text();
    if (controller.signal.aborted) throw aborted();
    if (text.length > maxChars) throw new Error(purpose + ' returned an oversized response.');
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted) throw aborted();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        controller.abort();
        void reader.cancel().catch(() => {});
        throw new Error(purpose + ' returned an oversized response.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // The app's React Native TextDecoder polyfill does not support `fatal`.
  const text = new TextDecoder('utf-8').decode(bytes);
  if (text.length > maxChars) throw new Error(purpose + ' returned an oversized response.');
  return text;
}
