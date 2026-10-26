import { assertSafeRemoteUrl } from '../config';
import { strictFetch, readBoundedText } from '../strict-http-transport';
import type { UmaPeerTransport } from './uma';
export function encodeBase64url(bytes: Uint8Array): string {
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid canonical peer bytes.');
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  if (encodeBase64url(bytes) !== value) throw new Error('Invalid canonical peer bytes.');
  return bytes;
}
export const nativeUmaPeer: UmaPeerTransport = {
  async send(request) {
    const url = assertSafeRemoteUrl(request.url, 'UMA provider');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      let body: string | undefined;
      if (request.method === 'POST') {
        const bytes = decodeBase64url(request.body_base64url);
        body = new TextDecoder().decode(bytes);
        if (encodeBase64url(new TextEncoder().encode(body)) !== request.body_base64url) throw new Error('Invalid UTF-8 UMA request.');
      }
      const response = await strictFetch(url.toString(), { method: request.method, body,
        headers: request.method === 'POST' ? { 'Content-Type': 'application/json' } : {}, signal: controller.signal,
        redirect: 'error' }, 262_144);
      if (response.redirected || response.url && response.url !== url.toString()) throw new Error('UMA redirects are not allowed.');
      const raw = await readBoundedText(response, 'UMA provider', 262_144, controller, 262_144);
      return { url: request.url, http_status: response.status, content_type: response.headers.get('content-type') || '',
        body_base64url: encodeBase64url(new TextEncoder().encode(raw)) };
    } finally { clearTimeout(timer); }
  },
};
