import type { OnchainNetwork, OnchainOperation, OnchainQuote } from './types';

export const MAX_SATS = 2_100_000_000_000_000;
export const QUOTE_LIFETIME_MS = 120_000;
export function sats(value: number | bigint): number {
  const number = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_SATS) {
    throw new Error('Invalid Bitcoin amount.');
  }
  return number;
}
export function assertQuote(quote: OnchainQuote, scope: string, network: OnchainNetwork, now = Date.now()): void {
  if (quote.version !== 1 || quote.scope !== scope || quote.network !== network ||
      !Number.isSafeInteger(quote.expiresAt) || !Number.isSafeInteger(quote.feeRate) || quote.feeRate<=0 || quote.expiresAt <= now || quote.expiresAt > now + QUOTE_LIFETIME_MS ||
      !/^[0-9a-f]{64}$/.test(quote.txid) || !quote.address || !quote.psbt ||
      !Number.isSafeInteger(quote.vout) || quote.vout < 0 ||
      !quote.inputs.length || new Set(quote.inputs).size !== quote.inputs.length ||
      quote.inputs.some(input => !/^[0-9a-f]{64}:[0-9]+$/.test(input))) {
    throw new Error('Bitcoin payment details changed or expired. Prepare them again.');
  }
  if (sats(quote.amountSats) === 0 || sats(quote.feeSats) === 0 ||
      sats(quote.totalSats) !== sats(quote.amountSats + quote.feeSats)) {
    throw new Error('Invalid Bitcoin payment totals.');
  }
}
export function reservedInputs(operations: OnchainOperation[]): Set<string> {
  return new Set(operations.filter(operation =>
    operation.state !== 'aborted'
  ).flatMap(operation => operation.quote?.inputs ?? []));
}
export function transferNetworkMatches(onchain: OnchainNetwork, spark: 'MAINNET' | 'REGTEST'): boolean {
  return onchain === (spark === 'MAINNET' ? 'mainnet' : 'regtest');
}
export function resolveOnchainPolicy(input: {
  network: string; esploraUrl?: string; mainnetEnabled: boolean; allowLocal: boolean;
}): { network: OnchainNetwork; esploraUrl: string } {
  if (!['mainnet', 'testnet', 'signet', 'regtest'].includes(input.network)) throw new Error('Invalid Bitcoin network.');
  const network = input.network as OnchainNetwork;
  if (network === 'mainnet' && !input.mainnetEnabled) throw new Error('Bitcoin onchain mainnet has not been enabled for this build.');
  const defaults = { mainnet: 'https://mempool.space/api', testnet: 'https://mempool.space/testnet/api', signet: 'https://mempool.space/signet/api', regtest: '' };
  const raw = input.esploraUrl || defaults[network];
  if (!raw) throw new Error('Configure the Bitcoin regtest provider for this build.');
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(network === 'regtest' && input.allowLocal && url.protocol === 'http:'))) {
    throw new Error('Bitcoin provider must use HTTPS.');
  }
  return { network, esploraUrl: url.toString().replace(/\/$/, '') };
}
