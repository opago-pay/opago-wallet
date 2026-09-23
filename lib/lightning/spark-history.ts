import { extractLightningPaymentHash } from '../lightning';
import { verifyPaymentPreimage } from '../payments';
import { withTimeout } from '../promise-timeout';
import { LIGHTNING_UNPAID_STATUSES } from './payment-status';
import { recordLightningRecoveryStage } from './recovery-diagnostics';
import type {
  LightningPaymentJournalRecord,
  LightningPaymentResolution,
} from './payment-journal';

export interface SparkUserRequestLike {
  typename?: unknown;
  id?: unknown;
  status?: unknown;
  idempotencyKey?: unknown;
  encodedInvoice?: unknown;
  paymentPreimage?: unknown;
  invoice?: { paymentHash?: unknown };
  transfer?: { totalAmount?: { originalValue?: unknown; originalUnit?: unknown } };
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
  getUserRequests?(params: { first: number; after?: string }): Promise<{
    entities?: SparkUserRequestLike[];
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  } | null>;
  queryHTLC?(params: { paymentHashes: string[]; matchRole: 1; limit: number; offset: number }): Promise<{
    preimageRequests?: { paymentHash?: unknown; preimage?: unknown; status?: unknown }[];
  }>;
}

// SDK 0.7.12 queryHTLC defaults to RECEIVER. Explicitly query SENDER (1)
// because this journal contains outgoing payments. A transfer ID is not an
// SSP request ID and must never be persisted as one.
async function resolveOperatorPayment(
  wallet: SparkHistoryWalletLike,
  record: LightningPaymentJournalRecord,
): Promise<LightningPaymentResolution | null> {
  if (!wallet.queryHTLC) return null;
  try {
    const response = await withTimeout(wallet.queryHTLC({
      paymentHashes: [record.paymentHash], matchRole: 1, limit: 100, offset: 0,
    }), 7_000, 'Lightning operator status timed out.');
    if (!Array.isArray(response?.preimageRequests)) throw new Error('Invalid operator response.');
    const toHex = (value: unknown): string | null => value instanceof Uint8Array && value.length === 32
      ? Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('') : null;
    const matching = response.preimageRequests.filter(item => toHex(item.paymentHash) === record.paymentHash);
    for (const item of matching) {
      try {
        verifyPaymentPreimage(toHex(item.preimage), record.paymentHash);
        recordLightningRecoveryStage('operator_confirmed');
        return { state: 'confirmed', result: 'OPERATOR_PREIMAGE_VERIFIED', requestId: record.requestId };
      } catch {
        // Neither a status label nor a missing/returned HTLC proves the
        // recipient was unpaid. Only a hash-bound preimage proves settlement.
      }
    }
    recordLightningRecoveryStage(matching.length ? 'operator_unresolved' : 'operator_missing');
  } catch {
    recordLightningRecoveryStage('operator_unavailable');
  }
  return null;
}

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
    const page = await withTimeout(wallet.getTransfers(limit, offset), 12_000, 'Lightning history timed out.');
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

/** One display page only. Recovery's independent full-history search is unchanged. */
export async function loadSparkTransferPage(wallet: SparkHistoryWalletLike, limit = 10, offset = 0) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Invalid Lightning history page.');
  }
  const page = await withTimeout(wallet.getTransfers(limit, offset), 8_000, 'Lightning history page timed out.');
  if (!Array.isArray(page.transfers)) throw new Error('Lightning history is unavailable.');
  const transfers = page.transfers.slice(0, limit);
  const reported = page.offset;
  const next = reported === -1 || transfers.length < limit ? null
    : Number.isSafeInteger(reported) && reported! > offset ? reported! : offset + transfers.length;
  return { transfers, next };
}

// A send request can exist at the provider before it appears in transfer
// history. Read that independent index when the submit response was lost.
export async function loadSparkLightningSendRequests(
  wallet: SparkHistoryWalletLike,
  maximumItems = 500,
  pageSize = 50,
): Promise<SparkUserRequestLike[]> {
  if (!Number.isSafeInteger(maximumItems) || maximumItems <= 0 || maximumItems > 1_000 ||
      !Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > 100) {
    throw new Error('Invalid Lightning request pagination limits.');
  }
  if (!wallet.getUserRequests) return [];
  const requests: SparkUserRequestLike[] = [];
  const cursors = new Set<string>();
  const deadline = Date.now() + 10_000;
  let inspected = 0;
  let after: string | undefined;
  while (inspected < maximumItems) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Lightning requests timed out.');
    const page = await withTimeout(wallet.getUserRequests({
      first: Math.min(pageSize, maximumItems - inspected), after,
    }), remaining, 'Lightning requests timed out.');
    if (!page || !Array.isArray(page.entities)) throw new Error('Lightning requests are unavailable.');
    const items = page.entities.slice(0, maximumItems - inspected);
    inspected += items.length;
    requests.push(...items.filter(request => request?.typename === 'LightningSendRequest'));
    if (page.pageInfo?.hasNextPage !== true) break;
    const cursor = page.pageInfo.endCursor;
    if (!items.length || typeof cursor !== 'string' || !cursor || cursors.has(cursor)) {
      throw new Error('Lightning request pagination did not advance.');
    }
    cursors.add(cursor);
    after = cursor;
  }
  return requests;
}

function resolveRequest(
  paymentHash: string,
  request: SparkUserRequestLike | null | undefined,
): LightningPaymentResolution {
  if (!request) return { state: 'pending', result: null };
  const status = normalizedStatus(request.status);
  const requestId = typeof request.id === 'string' ? request.id : null;
  try {
    verifyPaymentPreimage(request.paymentPreimage, paymentHash);
    return { state: 'confirmed', result: status || 'PREIMAGE_VERIFIED', requestId };
  } catch {
    if (LIGHTNING_UNPAID_STATUSES.has(status)) {
      return { state: 'failed', result: status, requestId };
    }
  }
  return { state: 'pending', result: null, requestId };
}

export async function resolveLightningPaymentFromSpark(
  wallet: SparkHistoryWalletLike,
  record: LightningPaymentJournalRecord,
  loadHistory: () => Promise<SparkTransferLike[]> = () =>
    loadSparkTransfersPaginated(wallet, 500, 50),
  loadRequests: () => Promise<SparkUserRequestLike[]> = () =>
    loadSparkLightningSendRequests(wallet),
): Promise<LightningPaymentResolution> {
  let directResolution: LightningPaymentResolution = {
    state: 'pending',
    result: null,
    requestId: record.requestId,
  };
  if (record.requestId && wallet.getLightningSendRequest) {
    try {
      const request = await withTimeout(wallet.getLightningSendRequest(record.requestId), 12_000, 'Lightning status timed out.');
      if (request?.id === record.requestId && sparkUserRequestPaymentHash(request) === record.paymentHash) {
        directResolution = resolveRequest(record.paymentHash, request);
        recordLightningRecoveryStage(directResolution.state === 'confirmed' ? 'direct_confirmed' : directResolution.state === 'failed' ? 'direct_failed' : 'direct_pending');
      }
      if (directResolution.state !== 'pending') return directResolution;
    } catch {
      recordLightningRecoveryStage('direct_unavailable');
      // A missing/stale direct lookup can still be resolved from paginated
      // outgoing history using the deterministic idempotency key.
    }
  }

  // This read-only operator lookup also covers a lost response before the
  // provider creates its LightningSendRequest. It runs alongside the index
  // lookup so its timeout does not add to the normal history path.
  const operatorResolution = resolveOperatorPayment(wallet, record);
  try {
    const matching = (await loadRequests()).find(request =>
      request.typename === 'LightningSendRequest' && sparkUserRequestPaymentHash(request) === record.paymentHash,
    );
    if (matching) {
      directResolution = resolveRequest(record.paymentHash, matching);
      recordLightningRecoveryStage(directResolution.state === 'confirmed' ? 'request_confirmed' : directResolution.state === 'failed' ? 'request_failed' : 'request_pending');
      if (directResolution.state !== 'pending') return directResolution;
    } else recordLightningRecoveryStage('request_missing');
  } catch {
    recordLightningRecoveryStage('requests_unavailable');
    // An unavailable request index is not evidence that nothing was sent.
  }

  const operator = await operatorResolution;
  if (operator) return { ...operator, requestId: directResolution.requestId };

  try {
    const matching = (await loadHistory()).find(transfer =>
      String(transfer.transferDirection || '').toUpperCase() === 'OUTGOING' &&
      sparkUserRequestPaymentHash(transfer.userRequest) === record.paymentHash,
    );
    if (matching) {
      const resolution = resolveRequest(record.paymentHash, matching.userRequest);
      recordLightningRecoveryStage(resolution.state === 'confirmed' ? 'history_confirmed' : resolution.state === 'failed' ? 'history_failed' : 'history_pending');
      return { ...resolution, requestId: resolution.requestId || directResolution.requestId };
    } else recordLightningRecoveryStage('history_missing');
  } catch {
    recordLightningRecoveryStage('history_unavailable');
    // Keep a newly discovered request ID even while history is unavailable.
  }
  return directResolution;
}
