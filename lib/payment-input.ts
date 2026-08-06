export type PaymentCurrency = 'SAT' | 'EUR';

export function parsePaymentAmount(
  input: string,
  currency: PaymentCurrency,
  btcToEur: number,
): number {
  if (!input.trim()) return 0;
  const value = Number(input.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a positive amount.');
  if (currency === 'SAT') {
    if (!Number.isSafeInteger(value)) throw new Error('Satoshi amounts must be whole numbers.');
    return value;
  }
  if (!Number.isFinite(btcToEur) || btcToEur <= 0) {
    throw new Error('The EUR exchange rate is unavailable.');
  }
  const sats = Math.floor((value / btcToEur) * 1e8);
  if (sats <= 0) throw new Error('The converted amount is below one satoshi.');
  return sats;
}

export function resolveLnurlAmount(minSendableMsat: number, maxSendableMsat: number, requested: number): number {
  const min = Math.ceil(minSendableMsat / 1000);
  const max = Math.floor(maxSendableMsat / 1000);
  const amount = requested > 0 ? requested : min === max ? min : 0;
  if (amount <= 0) throw new Error('This LNURL requires an amount.');
  if (amount < min || amount > max) throw new Error('Amount must be between ' + min + ' and ' + max + ' SAT.');
  return amount;
}
