import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { strictFetch, readBoundedText } from '../strict-http-transport';
import { base64url, parseStrictJson, utf8 } from './encoding';
import type { HkaHttp } from './hka';
import type { OidcVerifierPorts } from './oidc-verifier';

function bridge() {
  const module = requireOptionalNativeModule<{ verifyRs256(n: string, e: string, message: string, signature: string): Promise<boolean> }>('OpagoSafeHttp');
  if (!['android', 'ios'].includes(Platform.OS) || !module?.verifyRs256) throw new Error('Updated secure native transport is required.'); return module;
}
/** Enforce the peer-bound native transport also for fixed account origins. No compatibility fallback. */
export const nativeHkaHttp: HkaHttp = async (url, options) => {
  bridge(); const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) throw new Error('Invalid account endpoint.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(10_000, options.timeoutMs));
  try {
    const response = await strictFetch(url, { method: options.method, headers: options.headers, body: options.body, signal: controller.signal, redirect: 'error' }, options.maxBytes);
    if (response.redirected || response.url && response.url !== url) throw new Error('Account redirect rejected.');
    const body = await readBoundedText(response, 'OPAGO account', options.maxBytes, controller, options.maxBytes);
    if (utf8(body).length > options.maxBytes) throw new Error('Account response exceeds limit.');
    return { status: response.status, body, contentType: response.headers.get('content-type') || '', cacheControl: response.headers.get('cache-control') || '', retryAfter: response.headers.get('retry-after') || '', requestId: response.headers.get('x-request-id') || '' };
  } finally { clearTimeout(timer); }
};
export async function nativeOidcJson(url: string): Promise<unknown> {
  const response = await nativeHkaHttp(url, { method: 'GET', headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }, maxBytes: 65_536, timeoutMs: 10_000 });
  if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.contentType)) throw new Error('OIDC configuration is unavailable.'); return parseStrictJson(response.body);
}
export const nativeOidcVerifierPorts: OidcVerifierPorts = { json: nativeOidcJson,
  async verifyRs256(n, e, message, signature) { return (await bridge().verifyRs256(base64url(n), base64url(e), base64url(message), base64url(signature))) === true; },
};
