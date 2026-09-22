export type PaymentCurrency = 'SAT' | 'EUR';
export type ScannablePaymentSource = 'spark' | 'hedera';

/** Edit the amount without invoking a system keyboard or interpreting pasted text. */
export function editPaymentAmount(input: string, key: string, currency: PaymentCurrency, separator: '.' | ','): string {
  if (key === 'delete') return input.slice(0, -1);
  if (key === '.' || key === ',') {
    if (currency === 'SAT' || /[.,]/.test(input)) return input;
    return `${input || '0'}${separator}`;
  }
  if (!/^[0-9]$/.test(key) || input.length >= 24) return input;
  const fraction = input.split(/[.,]/)[1];
  if (fraction != null && fraction.length >= 8) return input;
  return input === '0' ? key : input + key;
}

export function inferPaymentSourceFromRequest(
  input: string,
  fallback: ScannablePaymentSource = 'spark',
): ScannablePaymentSource {
  const value = input.trim();
  if (/^(?:hedera:|0\.0\.[1-9]\d*(?:\?|$)|opagowallet:\/\/hedera-checkout(?:[/?]|$))/i.test(value)) {
    return 'hedera';
  }
  return fallback;
}

export function parsePaymentAmount(
  input: string,
  currency: PaymentCurrency,
  btcToEur: number,
): number {
  if (!input.trim()) return 0;
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,8})?$/.test(normalized) || normalized.length > 32) throw new Error('Enter a positive amount.');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a positive amount.');
  if (currency === 'SAT') {
    if (!Number.isSafeInteger(value) || value > 2_100_000_000_000_000) throw new Error('Satoshi amounts must be whole numbers.');
    return value;
  }
  if (!Number.isFinite(btcToEur) || btcToEur <= 0) {
    throw new Error('The EUR exchange rate is unavailable.');
  }
  if (btcToEur > 1e12) throw new Error('The EUR exchange rate is unavailable.');
  const scaled = (decimal: string) => {
    const [whole, fraction = ''] = decimal.split('.');
    return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'));
  };
  const rate = scaled(btcToEur.toFixed(8));
  if (rate <= 0n) throw new Error('The EUR exchange rate is unavailable.');
  const sats = Number(scaled(normalized) * 100_000_000n / rate);
  if (!Number.isSafeInteger(sats) || sats > 2_100_000_000_000_000) throw new Error('Invalid Bitcoin amount.');
  if (sats <= 0) throw new Error('The converted amount is below one satoshi.');
  return sats;
}

export function resolveLnurlAmount(minSendableMsat: number, maxSendableMsat: number, requested: number): number {
  const min = Math.ceil(minSendableMsat / 1000);
  const max = Math.floor(maxSendableMsat / 1000);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min) {
    throw new Error('LNURL endpoint returned invalid payment limits.');
  }
  if (!Number.isSafeInteger(requested) || requested < 0) {
    throw new Error('Satoshi amounts must be whole numbers.');
  }
  const amount = requested > 0 ? requested : min === max ? min : 0;
  if (amount <= 0) throw new Error('This LNURL requires an amount.');
  if (amount < min || amount > max) throw new Error('Amount must be between ' + min + ' and ' + max + ' SAT.');
  return amount;
}
