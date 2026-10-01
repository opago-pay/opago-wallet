/** All accounting uses integer sats. Rates are presentation only. */
export const MAX_BITCOIN_SATS = 2_100_000_000_000_000;

export function sats(value: unknown): number {
  if (typeof value !== 'bigint' && typeof value !== 'number' &&
      !(typeof value === 'string' && /^\d+$/.test(value))) throw new Error('Invalid Bitcoin amount.');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > MAX_BITCOIN_SATS) {
    throw new Error('Invalid Bitcoin amount.');
  }
  return result;
}

export function btcToSats(value: string): number {
  if (!/^\d+(?:\.\d{1,8})?$/.test(value) || value.length > 32) throw new Error('Invalid Bitcoin amount.');
  const [whole, fraction = ''] = value.split('.');
  return sats(BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0')));
}

export function satsToBtc(value: number): string {
  const amount = BigInt(sats(value));
  return `${amount / 100_000_000n}.${String(amount % 100_000_000n).padStart(8, '0')}`;
}

/** Localize decimal/group separators while preserving all eight Bitcoin decimals. */
export function formatBtcBalance(value: number, locale: string): string {
  const [whole, rawFraction] = satsToBtc(value).split('.');
  const fraction = rawFraction.replace(/0+$/, '');
  const integer = Number(whole).toLocaleString(locale);
  if (!fraction) return integer;
  // iOS Hermes has NumberFormat.format but not formatToParts. Only format
  // this small probe; the actual balance stays in integer sats for precision.
  const decimal = new Intl.NumberFormat(locale, { useGrouping: false }).format(1.1).replace(/[0-9]/g, '') || '.';
  return integer + decimal + fraction;
}

export interface SparkBalanceResponse {
  balance?: unknown;
  satsBalance?: { available?: unknown; owned?: unknown; incoming?: unknown };
}
export interface BitcoinBalanceSnapshot {
  available: number;
  reserved: number | null;
  incoming: number | null;
}

export function readBitcoinBalance(result: SparkBalanceResponse): BitcoinBalanceSnapshot {
  // Old SDKs had no available field (some exposed an incoming-only breakdown).
  // An explicitly present but malformed available value must never use the alias.
  const modern = !!result.satsBalance && Object.prototype.hasOwnProperty.call(result.satsBalance, 'available');
  const available = sats(modern ? result.satsBalance!.available : result.balance);
  const owned = result.satsBalance?.owned === undefined ? null : sats(result.satsBalance.owned);
  return {
    available,
    // Owned is an event-driven cache; fresh available can temporarily be newer.
    reserved: owned === null ? null : Math.max(0, owned - available),
    incoming: result.satsBalance?.incoming === undefined ? null : sats(result.satsBalance.incoming),
  };
}
