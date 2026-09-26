import type { BitcoinOperation } from './bitcoin/store';

export interface PaymentHistoryItem {
  key: string;
  type: 'incoming' | 'outgoing';
  amountDisplay: string;
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
}

export function bitcoinOperationHistoryItem(operation: BitcoinOperation, locale: string): PaymentHistoryItem {
  return {
    key: operation.id,
    txId: operation.txid ?? operation.requestId ?? operation.id,
    type: operation.kind === 'deposit' ? 'incoming' : 'outgoing',
    amountDisplay: operation.amountSats > 0 ? operation.amountSats.toLocaleString(locale) : '—',
    asset: 'SAT',
    status: operation.state,
    timestamp: operation.createdAt,
    route: 'onchain',
    operation,
  };
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
