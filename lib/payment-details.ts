import type { BitcoinOperation } from './bitcoin/store';
import type { TransactionRate } from './transaction-rates';

export interface PaymentHistoryItem {
  key: string;
  type: 'incoming' | 'outgoing';
  amountDisplay: string;
  /** Numeric amount in the displayed asset unit (SAT or HBAR). */
  amountValue?: number;
  asset: string;
  status: string;
  timestamp: string;
  txId: string | null;
  explorerUrl?: string;
  route?: 'lightning' | 'onchain';
  explorerLabel?: 'HashScan';
  priority?: number;
  reference?: string | null;
  requestId?: string | null;
  operation?: BitcoinOperation;
  btcEurRate?: number | null;
  btcEurRateAt?: string | null;
  transactionRate?: TransactionRate | null;
  transactionRatePending?: boolean;
  rateTimeBasis?: 'recorded' | 'network';
  rateTimeUnknown?: boolean;
}

export function bitcoinOperationHistoryItem(operation: BitcoinOperation, locale: string): PaymentHistoryItem {
  return {
    key: operation.id,
    txId: operation.txid ?? operation.requestId ?? operation.id,
    type: operation.kind === 'deposit' ? 'incoming' : 'outgoing',
    amountDisplay: operation.amountSats > 0 ? operation.amountSats.toLocaleString(locale) : '—',
    amountValue: operation.amountSats > 0 ? operation.amountSats : undefined,
    asset: 'SAT',
    status: operation.state,
    timestamp: operation.createdAt,
    route: 'onchain',
    operation,
    btcEurRate: operation.btcEurRate,
    btcEurRateAt: operation.btcEurRateAt,
  };
}

export type PaymentEurQuote = {
  eurValue: number;
  eurPerAsset: number;
  rateAsset: 'BTC' | 'HBAR';
  historical: boolean;
};

/** Capture a recent fiat estimate when a payment completes. */
export function paymentEurValueAtCurrentRate(
  asset: 'SAT' | 'HBAR',
  amount: number,
  rates: { btcToEur: number; hbarToEur: number; updatedAt: number },
  now = Date.now(),
): number | null {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rates.updatedAt) ||
      rates.updatedAt <= 0 || now < rates.updatedAt || now - rates.updatedAt > 300_000) return null;
  const rate = asset === 'SAT' ? rates.btcToEur : rates.hbarToEur;
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1e12) return null;
  return asset === 'SAT' ? amount / 100_000_000 * rate : amount * rate;
}

/** Only a rate captured for this payment may be presented as its historical value. */
export function paymentEurQuote(item: PaymentHistoryItem, rates?: { hbarToEur: number }): PaymentEurQuote | null {
  const amount = item.operation?.amountSats && item.operation.amountSats > 0
    ? item.operation.amountSats : item.amountValue;
  if (amount === undefined || !Number.isFinite(amount) || amount <= 0) return null;
  const saved = item.transactionRate;
  if (saved && saved.asset === (item.asset === 'HBAR' ? 'HBAR' : 'BTC') &&
      Number.isFinite(saved.eurPerCoin) && saved.eurPerCoin > 0) {
    return { eurValue: (item.asset === 'SAT' ? amount / 100_000_000 : amount) * saved.eurPerCoin,
      eurPerAsset: saved.eurPerCoin, rateAsset: saved.asset, historical: true };
  }
  if (item.transactionRatePending) return null;
  const rate = item.btcEurRate ?? item.operation?.btcEurRate;
  if (item.asset === 'SAT' && typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate <= 1e12) {
    return { eurValue: amount / 100_000_000 * rate, eurPerAsset: rate, rateAsset: 'BTC', historical: true };
  }
  // Current HBAR quotes must never replace the value of a past transaction.
  void rates;
  return null;
}

export function lightningHashFromPayment(item: PaymentHistoryItem): string | null {
  const match = /^ln:([a-f0-9]{64})$/.exec(item.key);
  return match?.[1] ?? null;
}

export function paymentMethodLabel(item: PaymentHistoryItem): string {
  if (item.route === 'onchain') return 'Bitcoin network';
  if (item.route === 'lightning') return 'Lightning';
  return item.asset === 'SAT' ? 'Bitcoin' : 'Hedera';
}

export function paymentDetailStatus(item: PaymentHistoryItem): string {
  if (item.status === 'action_required') return item.operation?.kind === 'deposit' ? 'Claim required' : 'Needs attention';
  if (item.status === 'broadcast' && item.asset === 'SAT' && item.route === 'onchain') {
    return 'Broadcast to the Bitcoin network';
  }
  if (['confirmed', 'success', 'completed'].includes(item.status)) return 'Completed';
  if (['failed', 'rejected', 'aborted'].includes(item.status)) return 'Failed';
  return item.type === 'outgoing' ? 'Status unknown' : 'Payment is being checked';
}

export function bitcoinExplorerUrl(item: PaymentHistoryItem): string | null {
  const operation = item.operation;
  return operation?.network === 'MAINNET' && /^[a-f0-9]{64}$/i.test(operation.txid ?? '')
    ? `https://mempool.space/tx/${operation.txid!.toLowerCase()}` : null;
}

export function paymentDetailReferences(item: PaymentHistoryItem): { label: string; value: string }[] {
  const references: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && !references.some(item => item.value === value)) references.push({ label, value });
  };
  if (item.operation) {
    add('Transaction ID', item.operation.txid);
    add('Request ID', item.operation.requestId);
    add('Quote ID', item.operation.quoteId);
    add('Transfer ID', item.operation.transferId);
  } else if (item.asset === 'SAT') {
    add('Payment hash', lightningHashFromPayment(item) ?? (item.txId && /^[a-f0-9]{64}$/i.test(item.txId) ? item.txId : null));
    add('Request ID', item.requestId ?? (item.reference && !item.reference.startsWith('ln:') ? item.reference : null));
    if (item.key.startsWith('spark:') && item.key.length > 6 && item.key !== 'spark:unknown') {
      add('Transfer ID', item.key.slice(6));
    }
  } else {
    add('Transaction ID', item.txId);
  }
  return references;
}
