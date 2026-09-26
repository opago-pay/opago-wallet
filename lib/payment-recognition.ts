import { parseBitcoinDestination } from './bitcoin/destination';
import { decodeLightningInvoice, normalizeLightningInput } from './lightning';
import { resolveLightningAddress, resolveLNURL } from './lnurl-safe';
import { resolveOcpUrl } from './ocp-safe';
import { loadPaymentEndpoint } from './payment-endpoint';
import { inferPaymentSourceFromRequest } from './payment-input';

export type RecognizedPayment = {
  input: string;
  kind: 'lightning' | 'onchain' | 'hedera' | 'checkout';
  /** A real address, domain or payment hash; never an asserted merchant identity. */
  recipient: string;
  amount: string | null;
  unit: 'SAT' | 'HBAR';
};

/** Read-only recognition. Never obtains a signing quote, creates an invoice or sends. */
export async function recognizePayment(input: string): Promise<RecognizedPayment> {
  const raw = input.trim();
  if (!raw || raw.length > 16_384) throw new Error('Could not read this payment code.');
  if (inferPaymentSourceFromRequest(raw) === 'hedera') {
    const [{ parseHederaCheckoutRequest }, { parseHederaPaymentRequest, formatTinybars }] = await Promise.all([
      import('./hedera/checkout'), import('./hedera/payments'),
    ]);
    const checkout = parseHederaCheckoutRequest(raw);
    const request = checkout ?? parseHederaPaymentRequest(raw);
    return { input: raw, kind: 'hedera', recipient: checkout?.merchantAccountId ?? ('accountId' in request ? request.accountId : ''),
      amount: request.amountTinybars === null ? null : formatTinybars(request.amountTinybars), unit: 'HBAR' };
  }
  const bitcoin = parseBitcoinDestination(raw);
  if (bitcoin) return { input: raw, kind: bitcoin.route,
    recipient: bitcoin.route === 'onchain' ? bitcoin.address! : bitcoin.invoice!.paymentHash,
    amount: bitcoin.amountSats === null ? null : String(bitcoin.amountSats), unit: 'SAT' };
  const normalized = normalizeLightningInput(raw);
  if (normalized.includes('@') || /^lnurl1/i.test(normalized)) {
    const ocpUrl = await resolveOcpUrl(normalized);
    const endpoint = ocpUrl ? await loadPaymentEndpoint(ocpUrl) : null;
    if (endpoint?.kind === 'ocp') return { input: raw, kind: 'checkout', recipient: new URL(ocpUrl!).hostname,
      amount: null, unit: 'SAT' };
    const info = endpoint?.kind === 'lnurl' ? endpoint.info : normalized.includes('@')
      ? await resolveLightningAddress(normalized) : await resolveLNURL(normalized);
    const min = Math.ceil(info.minSendable / 1000), max = Math.floor(info.maxSendable / 1000);
    return { input: raw, kind: 'lightning', recipient: normalized.includes('@') ? normalized : info.recipientDomain!,
      amount: min === max ? String(min) : null, unit: 'SAT' };
  }
  const invoice = decodeLightningInvoice(raw);
  return { input: raw, kind: 'lightning', recipient: invoice.paymentHash,
    amount: invoice.amountSats === null ? null : String(invoice.amountSats), unit: 'SAT' };
}
