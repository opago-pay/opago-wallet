import { HEDERA_PAYMENT_JOURNAL_KEY } from './hedera/payment-journal';
import { LIGHTNING_PAYMENT_JOURNAL_KEY } from './lightning/payment-journal';

export type LegacyPaymentIssue = {
  network: 'Bitcoin' | 'HBAR';
  pending: number;
  invalid: boolean;
  references: string[];
};

export interface LegacyPaymentStorage {
  getItem(key: string): Promise<string | null>;
}

function validTimestamp(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validLegacyRecord(value: unknown, network: LegacyPaymentIssue['network']): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!['pending', 'confirmed', 'failed'].includes(String(record.state)) ||
      !validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt) ||
      !(record.result === null || (typeof record.result === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(record.result)))) {
    return false;
  }
  if (network === 'Bitcoin') {
    return typeof record.paymentHash === 'string' && /^[0-9a-f]{64}$/.test(record.paymentHash) &&
      Number.isSafeInteger(record.amountSats) && Number(record.amountSats) > 0 &&
      (record.requestId === null || (typeof record.requestId === 'string' && record.requestId.length > 0 &&
        record.requestId.length <= 512 && !/[\u0000-\u001f\u007f]/.test(record.requestId)));
  }
  return typeof record.transactionId === 'string' &&
    /^\d+\.\d+\.\d+(?:@\d+\.\d{1,9}|-\d+-\d{1,9})$/.test(record.transactionId) &&
    ['direct', 'checkout'].includes(String(record.mode)) &&
    typeof record.recipientAccountId === 'string' && /^0\.0\.[1-9]\d*$/.test(record.recipientAccountId) &&
    typeof record.amountTinybars === 'string' && /^[1-9]\d*$/.test(record.amountTinybars) &&
    (record.paymentId === null || (typeof record.paymentId === 'string' && /^0x[0-9a-f]{64}$/.test(record.paymentId)));
}

function inspect(raw: string | null, network: LegacyPaymentIssue['network']): LegacyPaymentIssue | null {
  if (raw === null) return null;
  try {
    if (raw.length > 1_000_000) throw new Error('Legacy journal exceeds its safe size.');
    const document: unknown = JSON.parse(raw);
    if (!document || typeof document !== 'object' ||
      (document as { version?: unknown }).version !== 1 ||
      !Array.isArray((document as { records?: unknown }).records)) throw new Error('Invalid journal.');
    const records = (document as { records: unknown[] }).records;
    if (records.length > 10_000) throw new Error('Legacy journal exceeds its safe size.');
    const pending = records.filter(record => record && typeof record === 'object' &&
      (record as { state?: unknown }).state === 'pending');
    const malformed = records.some(record => !validLegacyRecord(record, network));
    if (!pending.length && !malformed) return null;
    const references = pending.map(record => network === 'Bitcoin'
      ? (record as { paymentHash?: unknown }).paymentHash
      : (record as { transactionId?: unknown }).transactionId)
      .filter((value): value is string => typeof value === 'string' &&
        (network === 'Bitcoin' ? /^[0-9a-f]{64}$/.test(value) : /^\d+\.\d+\.\d+(?:@\d+\.\d{1,9}|-\d+-\d{1,9})$/.test(value)))
      .slice(0, 5).map(value => '…' + value.slice(-12));
    return { network, pending: pending.length, invalid: malformed, references };
  } catch {
    return { network, pending: 0, invalid: true, references: [] };
  }
}

export async function reviewLegacyPayments(storage: LegacyPaymentStorage): Promise<LegacyPaymentIssue[]> {
  const [lightning, hedera] = await Promise.all([
    storage.getItem(LIGHTNING_PAYMENT_JOURNAL_KEY),
    storage.getItem(HEDERA_PAYMENT_JOURNAL_KEY),
  ]);
  return [inspect(lightning, 'Bitcoin'), inspect(hedera, 'HBAR')]
    .filter((issue): issue is LegacyPaymentIssue => issue !== null);
}
