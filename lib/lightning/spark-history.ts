import { extractLightningPaymentHash } from '../lightning';
import { verifyPaymentPreimage } from '../payments';
import type {
  LightningPaymentJournalRecord,
  LightningPaymentResolution,
} from './payment-journal';

export interface SparkUserRequestLike {
  id?: unknown;
  status?: unknown;
  idempotencyKey?: unknown;
  encodedInvoice?: unknown;
  paymentPreimage?: unknown;
  invoice?: { paymentHash?: unknown };
}

export interface SparkTransferLike {
  id?: unknown;
  status?: unknown;
  totalValue?: unknown;
  transferDirection?: unknown;
  createdTime?: string | number | Date;
  userRequest?: SparkUserRequestLike;
}

export interface SparkHistoryWalletLike {
  getTransfers(
    limit?: number,
    offset?: number,
  ): Promise<{ transfers?: SparkTransferLike[]; offset?: number }>;
  getLightningSendRequest?(id: string): Promise<SparkUserRequestLike | null>;
}

const SUCCESS_STATUSES = new Set([
  'LIGHTNING_PAYMENT_SUCCEEDED',
  'PREIMAGE_PROVIDED',
  'TRANSFER_COMPLETED',
]);
const FAILED_STATUSES = new Set([
  'USER_TRANSFER_VALIDATION_FAILED',
  'LIGHTNING_PAYMENT_FAILED',
  'PREIMAGE_PROVIDING_FAILED',
  'TRANSFER_FAILED',
  'USER_SWAP_RETURN_FAILED',
]);

function normalizedStatus(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function sparkUserRequestPaymentHash(request: SparkUserRequestLike | undefined): string | null {
  if (!request) return null;
  const directHash = String(request.invoice?.paymentHash || '').toLowerCase();
  if (/^[0-9a-f]{64}$/.test(directHash)) return directHash;

  const idempotencyKey = String(request.idempotencyKey || '');
  const idempotencyHash = idempotencyKey.startsWith('opago-')
    ? idempotencyKey.slice('opago-'.length).toLowerCase()
    : '';
  if (/^[0-9a-f]{64}$/.test(idempotencyHash)) return idempotencyHash;

  if (typeof request.encodedInvoice === 'string') {
    try {
      return extractLightningPaymentHash(request.encodedInvoice);
    } catch {
      return null;
    }
  }
  return null;
}

export async function loadSparkTransfersPaginated(
  wallet: SparkHistoryWalletLike,
  maximumItems = 200,
  pageSize = 50,
): Promise<SparkTransferLike[]> {
  if (!Number.isSafeInteger(maximumItems) || maximumItems <= 0 || maximumItems > 1_000) {
    throw new Error('Lightning history limit must be between 1 and 1000.');
  }
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > 100) {
    throw new Error('Lightning history page size must be between 1 and 100.');
  }
  const transfers: SparkTransferLike[] = [];
  let offset = 0;
  while (transfers.length < maximumItems) {
    const limit = Math.min(pageSize, maximumItems - transfers.length);
    const page = await wallet.getTransfers(limit, offset);
    const items = Array.isArray(page.transfers) ? page.transfers : [];
    transfers.push(...items);
    if (items.length < limit) break;
    const reportedOffset = Number(page.offset);
    const nextOffset = Number.isSafeInteger(reportedOffset) && reportedOffset > offset
      ? reportedOffset
      : offset + items.length;
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }
  return transfers;
}

function resolveRequest(
  paymentHash: string,
  request: SparkUserRequestLike | null | undefined,
  transferStatus?: unknown,
): LightningPaymentResolution {
  if (!request) return { state: 'pending', result: null };
  const status = normalizedStatus(request.status);
  const requestId = typeof request.id === 'string' ? request.id : null;
  if (FAILED_STATUSES.has(status) || normalizedStatus(transferStatus).includes('FAILED')) {
    return { state: 'failed', result: status || 'TRANSFER_FAILED', requestId };
  }
  const proof = request.paymentPreimage;
  if (SUCCESS_STATUSES.has(status) || normalizedStatus(transferStatus).includes('COMPLETED')) {
    try {
      verifyPaymentPreimage(proof, paymentHash);
      return { state: 'confirmed', result: status || 'TRANSFER_COMPLETED', requestId };
    } catch {
      return { state: 'pending', result: null, requestId };
    }
  }
  return { state: 'pending', result: null, requestId };
}

export async function resolveLightningPaymentFromSpark(
  wallet: SparkHistoryWalletLike,
  record: LightningPaymentJournalRecord,
  loadHistory: () => Promise<SparkTransferLike[]> = () =>
    loadSparkTransfersPaginated(wallet, 500, 50),
): Promise<LightningPaymentResolution> {
  let directResolution: LightningPaymentResolution = {
    state: 'pending',
    result: null,
    requestId: record.requestId,
  };
  if (record.requestId && wallet.getLightningSendRequest) {
    try {
      const request = await wallet.getLightningSendRequest(record.requestId);
      directResolution = resolveRequest(record.paymentHash, request);
      if (directResolution.state !== 'pending') return directResolution;
    } catch {
      // A missing/stale direct lookup can still be resolved from paginated
      // outgoing history using the deterministic idempotency key.
    }
  }

  const transfers = await loadHistory();
  const matching = transfers.find(transfer =>
    String(transfer.transferDirection || '').toUpperCase() === 'OUTGOING' &&
    sparkUserRequestPaymentHash(transfer.userRequest) === record.paymentHash,
  );
  if (!matching) return directResolution;
  return resolveRequest(record.paymentHash, matching.userRequest, matching.status);
}
