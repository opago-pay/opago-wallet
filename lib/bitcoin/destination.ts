import { Address } from '@scure/btc-signer/payment';
import { NETWORK, TEST_NETWORK } from '@scure/btc-signer/utils';
import { appConfig } from '../config';
import { decodeLightningInvoice, type LightningInvoiceDetails } from '../lightning';
import { btcToSats } from './amount';

export type BitcoinNetwork = 'MAINNET' | 'REGTEST';
export type BitcoinPaymentRoute = 'lightning' | 'onchain';
export type BitcoinDestination = {
  asset: 'bitcoin';
  route: BitcoinPaymentRoute;
  address?: string;
  invoice?: LightningInvoiceDetails;
  amountSats: number | null;
  label?: string;
  /** Expired Lightning requires explicitly reviewing this different route. */
  alternativeReason?: 'lightning-expired';
};

export function bitcoinNetwork(network: BitcoinNetwork = appConfig.sparkNetwork) {
  return network === 'MAINNET' ? NETWORK : { ...TEST_NETWORK, bech32: 'bcrt' };
}

export function validateBitcoinAddress(value: string, network: BitcoinNetwork = appConfig.sparkNetwork): string {
  if (!value || value.length > 100 || /\s/.test(value)) throw new Error('Invalid Bitcoin address or network.');
  try {
    const codec = Address(bitcoinNetwork(network));
    const decoded = codec.decode(value);
    if (!['pkh', 'sh', 'wpkh', 'wsh', 'tr'].includes(decoded.type)) throw new Error();
    return codec.encode(decoded);
  } catch { throw new Error('Invalid Bitcoin address or network.'); }
}

function displayLabel(value: string | undefined): string | undefined {
  return value?.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 200) || undefined;
}

/** Returns null for inputs handled by the existing LNURL/Lightning/Hedera/Checkout adapters. */
export function parseBitcoinDestination(input: string, network: BitcoinNetwork = appConfig.sparkNetwork): BitcoinDestination | null {
  const raw = input.trim();
  if (raw.length > 16_384) throw new Error('Payment destination is too long.');
  if (!/^bitcoin:/i.test(raw)) {
    if (!/^(?:[13mn2]|bc1|tb1|bcrt1)/i.test(raw) || /[@:\/?]/.test(raw)) return null;
    return { asset: 'bitcoin', route: 'onchain', address: validateBitcoinAddress(raw, network), amountSats: null };
  }
  const body = raw.slice(raw.indexOf(':') + 1);
  if (body.includes('#') || body.startsWith('//')) throw new Error('Invalid Bitcoin payment request.');
  const question = body.indexOf('?');
  const addressText = question < 0 ? body : body.slice(0, question);
  const address = addressText ? validateBitcoinAddress(addressText, network) : undefined;
  const entries = new Map<string, string[]>();
  // URLSearchParams tolerates invalid %-escapes; BIP payment input must not.
  const query = question < 0 ? '' : body.slice(question + 1);
  if (/%(?![\da-f]{2})/i.test(query)) throw new Error('Invalid Bitcoin payment request.');
  for (const pair of query.split('&').filter(Boolean)) {
    const separator = pair.indexOf('=');
    if (separator < 1) throw new Error('Invalid Bitcoin payment request.');
    let key: string, value: string;
    try { key = decodeURIComponent(pair.slice(0, separator)).toLowerCase(); value = decodeURIComponent(pair.slice(separator + 1)); }
    catch { throw new Error('Invalid Bitcoin payment request.'); }
    if (key.startsWith('req-')) throw new Error('This Bitcoin request requires an unsupported feature.');
    const values = entries.get(key) ?? [];
    values.push(value);
    if (['amount', 'label', 'message', 'pop'].includes(key) && values.length > 1) {
      throw new Error('Ambiguous Bitcoin payment request.');
    }
    entries.set(key, values);
  }
  const amountText = entries.get('amount')?.[0];
  const amountSats = amountText === undefined ? null : btcToSats(amountText);
  if (amountSats === 0) throw new Error('Enter a positive amount.');
  const label = displayLabel(entries.get('label')?.[0]);
  const invoices = [...new Set(entries.get('lightning')?.map(value => value.toLowerCase()) ?? [])];
  if (invoices.length > 1) throw new Error('Ambiguous Bitcoin payment request.');
  if (invoices.length) {
    // Validate even an expired invoice fully, including signature, network and
    // amount agreement. Corruption is never an excuse to pick another route.
    const invoice = decodeLightningInvoice(invoices[0], { allowExpired: true });
    if (amountSats !== null && invoice.amountSats !== null && amountSats !== invoice.amountSats) {
      throw new Error('The Bitcoin request contains conflicting amounts.');
    }
    const fixedAmount = amountSats ?? invoice.amountSats;
    if (invoice.expiresAt !== null && invoice.expiresAt <= Date.now()) {
      if (!address) throw new Error('The Lightning invoice has expired.');
      return { asset: 'bitcoin', route: 'onchain', address, amountSats: fixedAmount, label, alternativeReason: 'lightning-expired' };
    }
    return { asset: 'bitcoin', route: 'lightning', invoice, address, amountSats: fixedAmount, label };
  }
  if (!address) throw new Error('No supported payment route in this Bitcoin request.');
  return { asset: 'bitcoin', route: 'onchain', address, amountSats, label };
}
