import { decode } from 'light-bolt11-decoder';
import { appConfig } from './config';

const BOLT11_PREFIXES = ['lnbc', 'lntb', 'lnbcrt', 'lnsb'];

export interface LightningInvoiceDetails {
  invoice: string;
  amountSats: number | null;
  paymentHash: string;
  expiresAt: number | null;
}

export function isBolt11Invoice(value: string): boolean {
  const normalized = value.toLowerCase();
  return BOLT11_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function normalizeLightningInput(value: string): string {
  let input = value.trim();
  if (!input) throw new Error('Payment destination is empty.');

  const lightningParameter = input.match(/[?&]lightning=([^&#]+)/i)?.[1];
  if (lightningParameter) input = decodeURIComponent(lightningParameter);

  input = input.replace(/^lightnings?:\/\//i, '').replace(/^lightning:/i, '').trim();
  if (/\s/.test(input)) throw new Error('Payment destination contains whitespace.');
  return input;
}

export function decodeLightningInvoice(invoiceInput: string): LightningInvoiceDetails {
  const invoice = normalizeLightningInput(invoiceInput);
  if (!isBolt11Invoice(invoice)) throw new Error('The destination is not a valid BOLT11 invoice.');
  const isMainnetInvoice = invoice.toLowerCase().startsWith('lnbc');
  const isRegtestInvoice = invoice.toLowerCase().startsWith('lnbcrt');
  if (appConfig.isMainnet ? !isMainnetInvoice : !isRegtestInvoice) {
    throw new Error(
      appConfig.isMainnet
        ? 'A mainnet build only accepts Bitcoin mainnet invoices.'
        : 'This safe development build only accepts Lightning regtest invoices.',
    );

  }
  const decoded = decode(invoice);
  const amountSection = decoded.sections.find(section => section.name === 'amount');
  const paymentHashSection = decoded.sections.find(section => section.name === 'payment_hash');
  const timestampSection = decoded.sections.find(section => section.name === 'timestamp');
  const expirySection = decoded.sections.find(section => section.name === 'expiry');

  const paymentHash =
    paymentHashSection && 'value' in paymentHashSection ? String(paymentHashSection.value) : '';
  if (!/^[a-f0-9]{64}$/i.test(paymentHash)) {
    throw new Error('The Lightning invoice has no valid payment hash.');
  }

  let amountSats: number | null = null;
  if (amountSection && 'value' in amountSection && amountSection.value !== undefined) {
    const millisats = BigInt(String(amountSection.value));
    if (millisats <= 0n || millisats % 1000n !== 0n) {
      throw new Error('Only positive whole-satoshi Lightning invoices are supported.');
    }
    const sats = millisats / 1000n;
    if (sats > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Lightning invoice amount is too large.');
    }
    amountSats = Number(sats);
  }

  const timestamp =
    timestampSection && 'value' in timestampSection ? Number(timestampSection.value) : null;
  const expiry = expirySection && 'value' in expirySection ? Number(expirySection.value) : null;
  const expiresAt = timestamp !== null && expiry !== null ? (timestamp + expiry) * 1000 : null;
  if (expiresAt !== null && expiresAt <= Date.now()) {
    throw new Error('The Lightning invoice has expired.');
  }

  return { invoice, amountSats, paymentHash: paymentHash.toLowerCase(), expiresAt };
}

export function extractLightningPaymentHash(invoiceInput: string): string {
  const invoice = normalizeLightningInput(invoiceInput);
  if (!isBolt11Invoice(invoice)) throw new Error('The destination is not a valid BOLT11 invoice.');
  const decoded = decode(invoice);
  const paymentHashSection = decoded.sections.find(section => section.name === 'payment_hash');
  const paymentHash =
    paymentHashSection && 'value' in paymentHashSection ? String(paymentHashSection.value) : '';
  if (!/^[a-f0-9]{64}$/i.test(paymentHash)) {
    throw new Error('The Lightning invoice has no valid payment hash.');
  }
  return paymentHash.toLowerCase();
}

export function resolveInvoiceAmount(
  invoice: LightningInvoiceDetails,
  requestedAmountSats?: number,
): number {
  const requested = requestedAmountSats === undefined ? null : requestedAmountSats;
  if (requested !== null && (!Number.isSafeInteger(requested) || requested <= 0)) {
    throw new Error('The selected Lightning amount must be a positive whole number of satoshis.');
  }

  if (invoice.amountSats !== null) {
    if (requested !== null && requested !== invoice.amountSats) {
      throw new Error(
        'Invoice amount mismatch: invoice requests ' +
          invoice.amountSats +
          ' SAT, but ' +
          requested +
          ' SAT was selected.',
      );
    }
    return invoice.amountSats;
  }
  if (requested === null) throw new Error('This amountless invoice requires a positive amount.');
  return requested;
}

export function calculateMaxLightningFee(
  amountSats: number,
  balanceSats: number,
  estimatedFeeSats: number | null = null,
): number {
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
    throw new Error('Invalid payment amount.');
  }
  if (!Number.isSafeInteger(balanceSats) || balanceSats < amountSats) {
    throw new Error('Insufficient Lightning balance.');
  }

  let fee: number;
  if (estimatedFeeSats !== null) {
    if (!Number.isSafeInteger(estimatedFeeSats) || estimatedFeeSats < 0) {
      throw new Error('Spark returned an invalid Lightning fee estimate.');
    }
    if (estimatedFeeSats > appConfig.maxLightningFeeSats) {
      throw new Error(
        'The Lightning fee estimate of ' + estimatedFeeSats +
          ' SAT exceeds your maximum fee of ' + appConfig.maxLightningFeeSats + ' SAT.',
      );
    }
    // The review screen presents this exact ceiling. Submission must retain it,
    // even if a later network quote increases; never silently use the build cap.
    fee = estimatedFeeSats;
  } else {
    const percentageCap = Math.max(1, Number((BigInt(amountSats) + 199n) / 200n));
    fee = Math.min(appConfig.maxLightningFeeSats, percentageCap);
  }
  if (fee > balanceSats - amountSats) {
    throw new Error('Insufficient balance for the payment and maximum fee of ' + fee + ' SAT.');
  }
  return fee;
}

export function createPaymentReference(paymentHash: string): string {
  return 'ln:' + paymentHash.toLowerCase();
}
