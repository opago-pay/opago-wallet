import { decodeLightningInvoice, normalizeLightningInput, resolveInvoiceAmount } from './lightning';
import { fetchInvoiceFromLNURLP, resolveLightningAddress, resolveLNURL } from './lnurl-safe';
import { resolveLnurlAmount } from './payment-input';

export interface LightningAmountRequirement {
  minSats: number;
  maxSats: number | null;
}

export type LightningDestinationResult =
  | { kind: 'amount-required'; limits: LightningAmountRequirement }
  | { kind: 'invoice'; invoice: string; amountSats: number; recipientLabel?: string };

// Resolving a reusable address is separate from requesting a payable invoice.
// A missing amount is a normal form step, and must never trigger a payment.
export async function resolveLightningDestination(
  input: string,
  requestedAmountSats = 0,
): Promise<LightningDestinationResult> {
  const normalized = normalizeLightningInput(input);
  const isAddress = normalized.includes('@');
  if (isAddress || /^lnurl1/i.test(normalized)) {
    const info = isAddress
      ? await resolveLightningAddress(normalized)
      : await resolveLNURL(normalized);
    const limits = {
      minSats: Math.ceil(info.minSendable / 1000),
      maxSats: Math.floor(info.maxSendable / 1000),
    };
    if (requestedAmountSats === 0 && limits.minSats !== limits.maxSats) {
      return { kind: 'amount-required', limits };
    }
    const amountSats = resolveLnurlAmount(info.minSendable, info.maxSendable, requestedAmountSats);
    const invoice = await fetchInvoiceFromLNURLP(info.callback, amountSats);
    // The callback must issue an invoice for exactly the amount selected.
    const details = decodeLightningInvoice(invoice);
    if (details.amountSats !== amountSats) {
      throw new Error('The LNURL invoice amount does not match the selected amount.');
    }
    return { kind: 'invoice', invoice, amountSats, recipientLabel: isAddress ? normalized : undefined };
  }

  const details = decodeLightningInvoice(normalized);
  if (details.amountSats === null && requestedAmountSats === 0) {
    return { kind: 'amount-required', limits: { minSats: 1, maxSats: null } };
  }
  return { kind: 'invoice', invoice: details.invoice, amountSats: resolveInvoiceAmount(details, requestedAmountSats || undefined) };
}
