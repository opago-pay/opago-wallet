import { bech32 } from 'bech32';

export const POS_PAYER_PENDING_MESSAGE = 'OPAGO POS payments are not supported in this release. The required payer verification is not available yet. No payment was sent.';

export class OpagoPosPayerUnavailableError extends Error {
  readonly code = 'opago_pos_payer_unavailable';
  constructor() { super(POS_PAYER_PENDING_MESSAGE); }
}

/** Recognition only, never an authorization allowlist. P01 may register a sale
 * even though it is a GET. Keep it out of anonymous LNURL/OCP discovery until
 * the authenticated wallet-payer contract exists. See docs/pos-payer-handoff.md.
 */
export function isOpagoPosPaymentUrl(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  const origins = ['https://api.opago.com', 'https://api.opago-pay.com', process.env.EXPO_PUBLIC_OPAGO_F3_API_ORIGIN,
    process.env.EXPO_PUBLIC_OPAGO_F3_ADDRESS_ORIGIN];
  const knownHost = origins.some(origin => {
    if (!origin) return false;
    try {
      const configured = new URL(origin);
      return configured.protocol === 'https:' && configured.origin === origin &&
        !configured.username && !configured.password &&
        configured.hostname === url.hostname.replace(/\.$/, '');
    } catch { return false; }
  });
  if (!knownHost) return false;
  // Include malformed/legacy variants on known hosts: rejecting these must not
  // turn them into an anonymous payment. This does not validate/decrypt p.
  const posPath = /^\/(?:lnpos\/api\/v1|opago-pos\/api\/v2)\/lnurl(?:\/|$)/i;
  if (posPath.test(url.pathname)) return true;
  let path: string;
  try { path = decodeURIComponent(url.pathname).replace(/\/+/g, '/'); }
  catch { return false; }
  return posPath.test(path);
}

export function assertNotOpagoPosPaymentUrl(url: string): void {
  if (isOpagoPosPaymentUrl(url)) throw new OpagoPosPayerUnavailableError();
}

/** Recognize QR, clipboard and deep-link wrappers without fetching or retaining
 * the encrypted payload. Unrelated payment formats retain their own validators.
 */
export function assertNotOpagoPosPayment(input: string): void {
  let candidate = input.trim();
  assertNotOpagoPosPaymentUrl(candidate);
  const parameter = candidate.match(/[?&]lightning=([^&#]+)/i)?.[1];
  if (parameter) {
    try { candidate = decodeURIComponent(parameter); } catch { return; }
  }
  candidate = candidate.replace(/^lightnings?:\/\//i, '').replace(/^lightning:/i, '').trim();
  if (/^lnurl1/i.test(candidate)) {
    try {
      const decoded = bech32.decode(candidate, 16_384);
      candidate = new TextDecoder().decode(Uint8Array.from(bech32.fromWords(decoded.words)));
    } catch { return; } // The existing LNURL parser rejects invalid encodings.
  }
  assertNotOpagoPosPaymentUrl(candidate);
}
