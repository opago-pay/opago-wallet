import { bech32 } from 'bech32';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { decodeLightningInvoice } from './lightning';
import { fetchJson } from './http';
import { assertSafeRemoteUrl } from './config';
import { requireIdentityPayments } from './product-capabilities';

export interface LNURLPResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: 'payRequest';
  recipientDomain?: string;
  compliance?: { isSubjectToTravelRule?: boolean; receiverIdentifier?: string };
  payerData?: { compliance?: { mandatory?: boolean } };
}

function validateLNURLResponse(data: LNURLPResponse): LNURLPResponse {
  if (!data || typeof data !== 'object') throw new Error('LNURL endpoint returned invalid payment limits.');
  if (data.compliance?.isSubjectToTravelRule || Object.values(data.payerData || {}).some(field => field?.mandatory)) {
    requireIdentityPayments();
  }
  if (
    data.tag !== 'payRequest' ||
    !Number.isSafeInteger(data.minSendable) ||
    !Number.isSafeInteger(data.maxSendable) ||
    data.minSendable <= 0 ||
    data.maxSendable < data.minSendable ||
    Math.floor(data.maxSendable / 1000) < Math.ceil(data.minSendable / 1000)
  ) {
    throw new Error('LNURL endpoint returned invalid payment limits.');
  }
  data.callback = assertSafeRemoteUrl(data.callback, 'LNURL callback').toString();
  lnurlDescription(data.metadata);
  return data;
}

export function lnurlDescription(metadata: string): string {
  try {
    if (typeof metadata !== 'string' || metadata.length > 200_000) throw new Error();
    const entries: unknown = JSON.parse(metadata);
    if (!Array.isArray(entries) || entries.some(entry => !Array.isArray(entry) || typeof entry[0] !== 'string')) throw new Error();
    const descriptions = entries.filter(entry => entry[0] === 'text/plain');
    if (descriptions.length !== 1 || typeof descriptions[0][1] !== 'string') throw new Error();
    // Remote display text is never interpreted as markup or trusted UI copy.
    return descriptions[0][1].replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, 500);
  } catch {
    throw new Error('LNURL endpoint returned invalid metadata.');
  }
}

export function decodeLNURL(lnurl: string): string {
  const normalized = lnurl.trim();
  if (!/^lnurl1/i.test(normalized)) throw new Error('Invalid LNURL prefix.');
  const decoded = bech32.decode(normalized, 2000);
  return new TextDecoder().decode(Uint8Array.from(bech32.fromWords(decoded.words)));
}

export async function resolveLNURL(lnurl: string): Promise<LNURLPResponse> {
  const url = assertSafeRemoteUrl(decodeLNURL(lnurl), 'LNURL endpoint').toString();
  const data = validateLNURLResponse(
    await fetchJson<LNURLPResponse>(url, {}, { purpose: 'LNURL endpoint' }),
  );
  return { ...data, recipientDomain: new URL(url).hostname };
}

export async function resolveLightningAddress(address: string): Promise<LNURLPResponse> {
  const match = address.match(/^([^@\s]+)@([a-z0-9.-]+)$/i);
  if (!match || match[2].startsWith('.') || match[2].endsWith('.')) {
    throw new Error('Invalid Lightning Address format.');
  }
  const data = await fetchJson<LNURLPResponse>(
    'https://' + match[2].toLowerCase() + '/.well-known/lnurlp/' + encodeURIComponent(match[1]),
    {},
    { purpose: 'Lightning Address' },
  );
  return { ...validateLNURLResponse(data), recipientDomain: match[2].toLowerCase() };
}

export async function fetchInvoiceFromLNURLP(
  request: LNURLPResponse,
  amountSat: number,
  payerData?: Record<string, unknown>,
): Promise<string> {
  if (payerData) requireIdentityPayments();
  if (!Number.isSafeInteger(amountSat) || amountSat <= 0 || !Number.isSafeInteger(amountSat * 1000)) {
    throw new Error('LNURL amount must be a positive whole number of satoshis.');
  }
  const callback = assertSafeRemoteUrl(request.callback, 'LNURL callback');
  callback.searchParams.set('amount', String(amountSat * 1000));
  callback.searchParams.set('nonce', String(Date.now()));
  if (callback.searchParams.has('payerdata')) throw new Error('Identity data in payment URLs is not supported.');

  const data = await fetchJson<{ pr?: string }>(
    callback.toString(),
    {},
    { purpose: 'LNURL invoice callback' },
  );
  if (typeof data?.pr !== 'string' || !data.pr) throw new Error('LNURL callback returned no payment request.');
  const details = decodeLightningInvoice(data.pr);
  if (details.amountSats !== amountSat) throw new Error('The LNURL invoice amount does not match the selected amount.');
  // LUD-06 also permits ordinary descriptions. If the invoice commits to
  // metadata with an h-tag, verify the exact original UTF-8 bytes (BOLT 11).
  if (details.descriptionHash && details.descriptionHash !== bytesToHex(sha256(utf8ToBytes(request.metadata)))) {
    throw new Error('The LNURL invoice metadata commitment is invalid.');
  }
  return details.invoice;
}
