import { bech32 } from 'bech32';
import { fetchJson } from './http';
import { assertSafeRemoteUrl } from './config';

export interface LNURLPResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: 'payRequest';
  compliance?: { isSubjectToTravelRule?: boolean; receiverIdentifier?: string };
  payerData?: { compliance?: { mandatory?: boolean } };
}

function validateLNURLResponse(data: LNURLPResponse): LNURLPResponse {
  if (
    data.tag !== 'payRequest' ||
    !Number.isFinite(data.minSendable) ||
    !Number.isFinite(data.maxSendable) ||
    data.minSendable <= 0 ||
    data.maxSendable < data.minSendable
  ) {
    throw new Error('LNURL endpoint returned invalid payment limits.');
  }
  data.callback = assertSafeRemoteUrl(data.callback, 'LNURL callback').toString();
  return data;
}

export function decodeLNURL(lnurl: string): string {
  const normalized = lnurl.trim();
  if (!/^lnurl1/i.test(normalized)) throw new Error('Invalid LNURL prefix.');
  const decoded = bech32.decode(normalized, 2000);
  return new TextDecoder().decode(Uint8Array.from(bech32.fromWords(decoded.words)));
}

export async function resolveLNURL(lnurl: string): Promise<LNURLPResponse> {
  const url = assertSafeRemoteUrl(decodeLNURL(lnurl), 'LNURL endpoint').toString();
  return validateLNURLResponse(
    await fetchJson<LNURLPResponse>(url, {}, { purpose: 'LNURL endpoint' }),
  );
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
  return validateLNURLResponse(data);
}

export async function fetchInvoiceFromLNURLP(
  callbackUrl: string,
  amountSat: number,
  payerData?: Record<string, unknown>,
): Promise<string> {
  if (!Number.isSafeInteger(amountSat) || amountSat <= 0) {
    throw new Error('LNURL amount must be a positive whole number of satoshis.');
  }
  const callback = assertSafeRemoteUrl(callbackUrl, 'LNURL callback');
  callback.searchParams.set('amount', String(amountSat * 1000));
  callback.searchParams.set('nonce', String(Date.now()));
  if (payerData) callback.searchParams.set('payerdata', JSON.stringify(payerData));

  const data = await fetchJson<{ pr?: string }>(
    callback.toString(),
    {},
    { purpose: 'LNURL invoice callback' },
  );
  if (!data.pr) throw new Error('LNURL callback returned no payment request.');
  return data.pr;
}
