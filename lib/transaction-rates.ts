export type RateAsset = 'BTC' | 'HBAR';
export type RateTimeBasis = 'recorded' | 'network' | 'block';
export interface TransactionRate {
  asset: RateAsset;
  eurPerCoin: number;
  transactionAt: string;
  rateAt: string;
  fetchedAt: string;
  source: 'Binance';
  method: 'minute-open' | 'cross-minute-open';
  timeBasis: RateTimeBasis;
}
export interface TransactionRateRequest {
  scope: string;
  key: string;
  asset: RateAsset;
  transactionAt: string | null;
  timeBasis: 'recorded' | 'network';
  /** Only mainnet onchain records; a confirmed block supplies the actual time. */
  bitcoinTxId?: string;
}
export interface TransactionRateJob extends TransactionRateRequest {
  quote: TransactionRate | null;
  attempts: number;
  nextAttempt: number;
}

export function assertRateRequest(request: TransactionRateRequest): void {
  if (!/^(?:btc:(?:MAINNET|REGTEST):(?:[a-f0-9]{64}|[a-f0-9]{66})|hbar:(?:mainnet|testnet):[a-f0-9]{64})$/.test(request.scope) ||
      typeof request.key !== 'string' || !request.key || request.key.length > 512 || /[\u0000-\u001f]/.test(request.key) ||
      !['BTC', 'HBAR'].includes(request.asset) ||
      (request.asset === 'BTC') !== request.scope.startsWith('btc:') ||
      !['recorded', 'network'].includes(request.timeBasis) ||
      (request.transactionAt !== null && (!Number.isFinite(Date.parse(request.transactionAt)) || Date.parse(request.transactionAt) < 1230768000000)) ||
      (request.bitcoinTxId !== undefined && (!/^[a-f0-9]{64}$/.test(request.bitcoinTxId) || !request.scope.startsWith('btc:MAINNET:')))) {
    throw new Error('Invalid transaction rate request.');
  }
}

export function assertTransactionRate(quote: TransactionRate): void {
  if (!quote || !['BTC', 'HBAR'].includes(quote.asset) || !Number.isFinite(quote.eurPerCoin) ||
      quote.eurPerCoin <= 0 || quote.eurPerCoin > 1e12 || quote.source !== 'Binance' ||
      !['minute-open', 'cross-minute-open'].includes(quote.method) ||
      !['recorded', 'network', 'block'].includes(quote.timeBasis)) throw new Error('Invalid transaction rate.');
  const transaction = Date.parse(quote.transactionAt);
  const rate = Date.parse(quote.rateAt);
  const fetched = Date.parse(quote.fetchedAt);
  if (![transaction, rate, fetched].every(Number.isFinite) || rate > transaction || transaction - rate >= 60_000 ||
      transaction > fetched + 120_000) throw new Error('Invalid transaction rate time.');
}

export function rateScope(asset: string, publicKey: string, networks: { sparkNetwork: string; hederaNetwork: string }): string {
  return asset === 'HBAR' ? `hbar:${networks.hederaNetwork}:${publicKey}` : `btc:${networks.sparkNetwork}:${publicKey}`;
}
