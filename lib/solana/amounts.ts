export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const SOL_DECIMALS = 9;
export const USDC_DECIMALS = 6;

export type SolanaAsset = 'SOL' | 'USDC';

export function parseDecimalBaseUnits(
  rawValue: string,
  decimals: number,
  label: string,
): bigint {
  const normalized = rawValue.trim().replace(',', '.');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(label + ' decimals are invalid.');
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error(label + ' must be a positive decimal amount.');
  const fractional = match[2] || '';
  if (fractional.length > decimals) {
    throw new Error(label + ' supports at most ' + decimals + ' decimal places.');
  }
  const base = 10n ** BigInt(decimals);
  const amount = BigInt(match[1]) * base + BigInt(fractional.padEnd(decimals, '0') || '0');
  if (amount <= 0n) throw new Error(label + ' must be greater than zero.');
  return amount;
}

export function formatBaseUnits(amount: bigint, decimals: number): string {
  if (amount < 0n) throw new Error('Amount cannot be negative.');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('Asset decimals are invalid.');
  }
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fractional = (amount % base)
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return fractional ? whole + '.' + fractional : whole.toString();
}

export function assetDecimals(asset: SolanaAsset): number {
  return asset === 'SOL' ? SOL_DECIMALS : USDC_DECIMALS;
}

export function parseSolanaAssetAmount(rawValue: string, asset: SolanaAsset): bigint {
  return parseDecimalBaseUnits(rawValue, assetDecimals(asset), asset + ' amount');
}

export function formatSolanaAssetAmount(amount: bigint, asset: SolanaAsset): string {
  return formatBaseUnits(amount, assetDecimals(asset));
}

export function parseRpcAtomicAmount(value: unknown, label: string): bigint {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    return BigInt(value);
  }
  throw new Error(label + ' is not an exact non-negative integer.');
}
