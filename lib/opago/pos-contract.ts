/** Prepared P01/P02 wire validation only. No signer, account authorization,
 * transport dispatch or payment execution. The production POS guard stays closed.
 * Source: Compliance 58acba32 docs/pos-payer-data.md; no provisioned verifier.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { decodeLightningInvoice } from '../lightning';
import { isOpagoPosPaymentUrl } from './pos-payment';

export class PosContractError extends Error {
  constructor(readonly code: 'invalid_offer' | 'invalid_payerdata' | 'invalid_invoice' | 'attempt_closed' | 'invoice_changed') {
    super('OPAGO POS payment cannot continue: ' + code);
  }
}
type JsonObject = Record<string, unknown>;
function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function url(value: unknown): URL {
  if (typeof value !== 'string' || /[\s\\]/.test(value)) throw new PosContractError('invalid_offer');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new PosContractError('invalid_offer'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.port)
    throw new PosContractError('invalid_offer');
  return parsed;
}
export type PosOffer = Readonly<{
  callback: string; attempt: string; metadata: string; amountMsat: number;
  requiredPayerFields: readonly string[];
}>;
export function parsePosOffer(scanUrl: string, response: unknown): PosOffer {
  const scan = url(scanUrl);
  if (!isOpagoPosPaymentUrl(scanUrl) || !/^\/lnpos\/api\/v1\/lnurl\/[A-Za-z0-9_-]{1,64}$/.test(scan.pathname)
      || scan.searchParams.getAll('p').length !== 1 || !scan.searchParams.get('p')
      || [...scan.searchParams.keys()].some(key => key !== 'p')) throw new PosContractError('invalid_offer');
  if (!object(response) || response.tag !== 'payRequest'
      || !Number.isSafeInteger(response.minSendable) || Number(response.minSendable) <= 0
      || response.minSendable !== response.maxSendable || Number(response.minSendable) % 1000 !== 0
      || typeof response.metadata !== 'string' || !object(response.payerData)) throw new PosContractError('invalid_offer');
  const callback = url(response.callback);
  const token = callback.pathname.match(/^\/lnpos\/api\/v1\/lnurl\/cb\/([0-9a-f]{32})$/)?.[1];
  if (callback.origin !== scan.origin || !token || callback.searchParams.getAll('attempt').length !== 1
      || callback.searchParams.get('attempt') !== token
      || [...callback.searchParams.keys()].some(key => key !== 'attempt')) throw new PosContractError('invalid_offer');
  try {
    const metadata: unknown = JSON.parse(response.metadata);
    if (!Array.isArray(metadata) || !metadata.length || !metadata.every(row =>
      Array.isArray(row) && row.length === 2 && row.every(value => typeof value === 'string'))
      || !metadata.some(row => row[0] === 'text/plain' && row[1])) throw new Error();
  } catch { throw new PosContractError('invalid_offer'); }
  const required: string[] = [];
  for (const field of ['identifier', 'compliance']) {
    const spec = response.payerData[field];
    if (!object(spec) || typeof spec.mandatory !== 'boolean') throw new PosContractError('invalid_offer');
  }
  for (const [name, spec] of Object.entries(response.payerData)) {
    if (!object(spec) || typeof spec.mandatory !== 'boolean') throw new PosContractError('invalid_offer');
    if (spec.mandatory) required.push(name);
  }
  // No expiry or recipient node key is advertised by the current P01 shape.
  // Never derive either from a local timer, optional payer fields or a login.
  return Object.freeze({ callback: callback.href, attempt: token, metadata: response.metadata,
    amountMsat: Number(response.minSendable), requiredPayerFields: Object.freeze(required) });
}

/** Keep the signed string in a closure, never in a serializable attempt record.
 * The backend alone validates trust, account association, custody and TME policy.
 * Omitting optional payerdata here is NOT an eligibility decision.
 */
export function preparePosAttempt(offer: PosOffer, payerdata?: string) {
  if (payerdata === undefined && offer.requiredPayerFields.length) throw new PosContractError('invalid_payerdata');
  if (payerdata !== undefined) {
    try {
      if (!payerdata || payerdata.length > 8192) throw new Error();
      const value: unknown = JSON.parse(payerdata);
      if (!object(value) || !object(value.compliance) || value.compliance.signatureNonce !== offer.attempt
          || typeof value.compliance.signature !== 'string' || !value.compliance.signature
          || offer.requiredPayerFields.some(field => value[field] === undefined || value[field] === null)) throw new Error();
    } catch { throw new PosContractError('invalid_payerdata'); }
  }
  const target = new URL(offer.callback);
  target.searchParams.set('amount', String(offer.amountMsat));
  if (payerdata !== undefined) target.searchParams.set('payerdata', payerdata);
  if (utf8ToBytes(target.pathname + target.search).length > 8000) throw new PosContractError('invalid_payerdata');
  let requestUrl: string | undefined = target.href;
  const descriptionHash = bytesToHex(sha256(utf8ToBytes(offer.metadata + (payerdata ?? ''))));
  let acceptedInvoice: string | undefined;
  return Object.freeze({
    request() {
      if (!requestUrl) throw new PosContractError('attempt_closed');
      // Caller must use a no-telemetry transport; do not log this request object.
      return { url: requestUrl, method: 'GET' as const, headers: { Accept: 'application/json' },
        cache: 'no-store' as const, redirect: 'error' as const };
    },
    inspectInvoice(response: unknown) {
      if (!requestUrl) throw new PosContractError('attempt_closed');
      if (!object(response) || typeof response.pr !== 'string') throw new PosContractError('invalid_invoice');
      let invoice;
      try { invoice = decodeLightningInvoice(response.pr); } catch { throw new PosContractError('invalid_invoice'); }
      if (invoice.amountSats === null || invoice.amountSats * 1000 !== offer.amountMsat
          || invoice.descriptionHash !== descriptionHash) throw new PosContractError('invalid_invoice');
      if (acceptedInvoice && acceptedInvoice !== invoice.invoice) throw new PosContractError('invoice_changed');
      acceptedInvoice = invoice.invoice;
      // Validates signature, network, payment secret, expiry, amount and h-tag.
      // This does not prove the bound merchant node or authorize payment.
      return Object.freeze({ ...invoice, recipientBindingVerified: false as const, paymentEnabled: false as const });
    },
    close() { requestUrl = undefined; acceptedInvoice = undefined; },
  });
}
