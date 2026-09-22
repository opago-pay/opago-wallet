import { sha256 } from '@noble/hashes/sha256';
import { readBitcoinBalance, type SparkBalanceResponse } from './bitcoin/amount';
import { withTimeout } from './promise-timeout';
import { LIGHTNING_UNPAID_STATUSES } from './lightning/payment-status';
import { recordLightningRecoveryStage } from './lightning/recovery-diagnostics';
import { timeSendStep } from './send-timing';
import {
  calculateMaxLightningFee,
  createPaymentReference,
  decodeLightningInvoice,
  resolveInvoiceAmount,
  type LightningInvoiceDetails,
} from './lightning';

export interface SparkPaymentResult {
  amountSats: number;
  paymentHash: string;
  proof: string;
  reference: string;
  requestId: string | null;
}

export interface PreparedSparkPayment {
  invoice: LightningInvoiceDetails;
  amountSats: number;
  maxFeeSats: number;
  estimatedFeeSats: number | null;
}

export interface LightningPaymentLifecycle {
  onPending?(payment: PreparedSparkPayment): Promise<void>;
  onRequestIdentified?(paymentHash: string, requestId: string): Promise<void>;
  onResolved?(
    paymentHash: string,
    state: 'confirmed' | 'failed',
    result: string,
    requestId: string | null,
  ): Promise<void>;
}

export class LightningPaymentPendingError extends Error {
  readonly paymentHash: string;

  constructor(paymentHash: string, cause?: unknown) {
    super(
      cause instanceof Error && /already (?:being processed|paid)/i.test(cause.message)
        ? cause.message
        : 'Lightning payment status is not final yet. Do not send it again.',
    );
    this.name = 'LightningPaymentPendingError';
    this.paymentHash = paymentHash;
  }
}

export class LightningFeeChangedError extends Error {
  constructor() {
    super('The network fee changed. Nothing was sent. Review this payment again.');
    this.name = 'LightningFeeChangedError';
  }
}

function feeRejectedBeforeSubmission(cause: unknown, maxFeeSats: number): boolean {
  // Pinned Spark SDK 0.7.12 throws this local validation error before selecting
  // leaves or contacting the swap/send service. Do not classify generic errors
  // (including similarly worded transport failures) as safe to resend.
  if (!(cause instanceof Error) || !/^maxFeeSats does not cover fee estimate(?: \[|$)/.test(cause.message)) return false;
  const error = cause as Error & { getContext?: () => Record<string, unknown> };
  try {
    const context = error.getContext?.();
    const fee = typeof context?.expected === 'string' && context.expected.match(/^(\d+) sats$/);
    return context?.field === 'maxFeeSats' && context.value === maxFeeSats && !!fee &&
      Number.isSafeInteger(Number(fee[1])) && Number(fee[1]) > maxFeeSats;
  } catch { return false; }
}

export interface SparkWalletLike {
  getBalance(): Promise<SparkBalanceResponse>;
  getBitcoinBalance?(): Promise<SparkBalanceResponse>;
  getLightningSendFeeEstimate?(input: {
    encodedInvoice: string;
    amountSats?: number;
  }): Promise<number>;
  payLightningInvoice(input: {
    invoice: string;
    maxFeeSats: number;
    amountSatsToSend?: number;
    idempotencyKey?: string;
  }): Promise<{
    id?: string;
    status?: string;
    preimage?: string;
    paymentPreimage?: string;
  }>;
}

export function verifyPaymentPreimage(preimage: unknown, paymentHash: string): string {
  const normalized = typeof preimage === 'string'
    ? preimage.toLowerCase().replace(/^0x/, '')
    : '';
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('Spark returned no valid 32-byte payment preimage.');
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  const digest = Array.from(sha256(bytes), value => value.toString(16).padStart(2, '0')).join('');
  if (digest !== paymentHash.toLowerCase()) {
    throw new Error('Spark payment proof does not match the invoice payment hash.');
  }
  return normalized;
}
async function readPaymentBalance(wallet: SparkWalletLike): Promise<number> {
  const balanceData = await withTimeout(
    wallet.getBitcoinBalance ? wallet.getBitcoinBalance() : wallet.getBalance(),
    15_000, 'Lightning balance timed out.',
  );
  return readBitcoinBalance(balanceData).available;
}

async function readPaymentFee(
  wallet: SparkWalletLike,
  invoice: LightningInvoiceDetails,
  amountSats: number,
): Promise<number | null> {
  if (!wallet.getLightningSendFeeEstimate) return null;
  let fee: number;
  try {
    fee = await withTimeout(wallet.getLightningSendFeeEstimate({
      encodedInvoice: invoice.invoice,
      amountSats: invoice.amountSats === null ? amountSats : undefined,
    }), 15_000, 'The Lightning fee estimate is unavailable.');
  } catch {
    // Do not expose SDK responses containing invoices or recipient data.
    throw new Error('The Lightning fee estimate is unavailable.');
  }
  if (!Number.isSafeInteger(fee) || fee < 0) {
    throw new Error('Spark returned an invalid Lightning fee estimate.');
  }
  return fee;
}

export async function prepareDecodedSparkPayment(
  wallet: SparkWalletLike,
  invoice: LightningInvoiceDetails,
  requestedAmountSats?: number,
): Promise<PreparedSparkPayment> {
  const amountSats = resolveInvoiceAmount(invoice, requestedAmountSats);
  // Both lookups are required for review and neither depends on the other.
  // Promise.all also observes either rejection without leaving a floating request.
  const [balanceSats, estimatedFeeSats] = await Promise.all([
    readPaymentBalance(wallet),
    readPaymentFee(wallet, invoice, amountSats),
  ]);
  if (balanceSats < amountSats) throw new Error('Insufficient Lightning balance.');
  const maxFeeSats = calculateMaxLightningFee(amountSats, balanceSats, estimatedFeeSats);

  return { invoice: { ...invoice }, amountSats, maxFeeSats, estimatedFeeSats };
}

export async function prepareSparkPayment(
  wallet: SparkWalletLike,
  invoiceInput: string,
  requestedAmountSats?: number,
): Promise<PreparedSparkPayment> {
  return prepareDecodedSparkPayment(wallet, decodeLightningInvoice(invoiceInput), requestedAmountSats);
}

export async function payPreparedSparkPayment(
  wallet: SparkWalletLike,
  payment: PreparedSparkPayment,
  lifecycle?: LightningPaymentLifecycle,
  assertAuthorized?: () => void,
): Promise<SparkPaymentResult> {
  return submitPreparedSparkPayment(wallet, payment, lifecycle, assertAuthorized, () => readPaymentBalance(wallet));
}

/** Overlap balance preparation with the native prompt, never payment submission. */
export async function authorizeAndPayPreparedSparkPayment(
  wallet: SparkWalletLike,
  payment: PreparedSparkPayment,
  authorize: () => Promise<() => void>,
  lifecycle?: LightningPaymentLifecycle,
  assertCurrent?: () => void,
): Promise<SparkPaymentResult> {
  assertCurrent?.();
  const approved = { ...payment, invoice: { ...payment.invoice } };
  resolveInvoiceAmount(approved.invoice, approved.amountSats);
  if (approved.invoice.expiresAt !== null && approved.invoice.expiresAt <= Date.now()) {
    throw new Error('The Lightning invoice has expired.');
  }
  // This performs the same balance preparation already allowed on review. It
  // neither reserves a payment nor sends one. Handle a late rejection even if
  // the owner cancels the prompt and this function has already returned.
  let approvalPending = true;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshes = 0;
  const refreshBalance = () => readPaymentBalance(wallet).then(
    value => {
      const result = { value, checkedAt: Date.now() };
      // Keep the same five-second freshness limit. During a longer PIN prompt,
      // do bounded, non-overlapping read-only refreshes before approval ends.
      if (approvalPending && refreshes < 6) refreshTimer = setTimeout(() => {
        if (!approvalPending) return;
        try { assertCurrent?.(); }
        catch { return; }
        refreshes++;
        balance = refreshBalance();
      }, 2_500);
      return result;
    },
    cause => ({ cause }),
  );
  let balance = refreshBalance();
  let assertAuthorized: () => void;
  try { assertAuthorized = await timeSendStep('device_approval', authorize); }
  finally {
    approvalPending = false;
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  }
  const assertApproved = () => { assertCurrent?.(); assertAuthorized(); };
  assertApproved();
  return submitPreparedSparkPayment(wallet, approved, lifecycle, assertApproved, async () => {
    const result = await balance;
    assertApproved();
    if ('cause' in result) throw result.cause;
    // A long PIN prompt must not turn this into a persistent balance cache.
    // Refresh again if the foreground preparation is now more than 5 s old.
    const age = Date.now() - result.checkedAt;
    return age >= 0 && age <= 5_000 ? result.value : readPaymentBalance(wallet);
  });
}

async function submitPreparedSparkPayment(
  wallet: SparkWalletLike,
  payment: PreparedSparkPayment,
  lifecycle: LightningPaymentLifecycle | undefined,
  assertAuthorized: (() => void) | undefined,
  readBalance: () => Promise<number>,
): Promise<SparkPaymentResult> {
  // Capture the approved values before any asynchronous work.
  const invoice = { ...payment.invoice };
  const { amountSats, maxFeeSats } = payment;
  resolveInvoiceAmount(invoice, amountSats);
  if (invoice.expiresAt !== null && invoice.expiresAt <= Date.now()) {
    throw new Error('The Lightning invoice has expired.');
  }

  // This is still read-only preparation. A process death or failed balance
  // lookup here must not leave an apparently submitted payment in the journal.
  // In particular, do not resolve an older attempt if this preflight fails.
  recordLightningRecoveryStage('send_preflight_started');
  try {
    assertAuthorized?.();
    const freshBalance = await readBalance();
    calculateMaxLightningFee(amountSats, freshBalance, maxFeeSats);
    if (invoice.expiresAt !== null && invoice.expiresAt <= Date.now()) {
      throw new Error('The Lightning invoice has expired.');
    }
    assertAuthorized?.();
  } catch (cause) {
    recordLightningRecoveryStage('send_preflight_aborted');
    throw cause;
  }

  if (lifecycle?.onPending) {
    try {
      await timeSendStep('journal_pending', () => lifecycle.onPending!({ ...payment, invoice, amountSats, maxFeeSats }));
    } catch (cause) {
      if (cause instanceof Error && /already (?:being processed|paid)/i.test(cause.message)) {
        throw new LightningPaymentPendingError(invoice.paymentHash, cause);
      }
      throw cause;
    }
  }

  let result: Awaited<ReturnType<SparkWalletLike['payLightningInvoice']>>;
  try {
    // The durable write is asynchronous: recheck the exact approval and
    // expiry afterwards, with no more balance/network work before submission.
    assertAuthorized?.();
    if (invoice.expiresAt !== null && invoice.expiresAt <= Date.now()) {
      throw new Error('The Lightning invoice has expired.');
    }
  } catch (cause) {
    await lifecycle?.onResolved?.(invoice.paymentHash, 'failed', 'CANCELLED_BEFORE_SUBMISSION', null);
    throw cause;
  }
  try {
    recordLightningRecoveryStage('send_sdk_started');
    result = await withTimeout(wallet.payLightningInvoice({
      invoice: invoice.invoice,
      maxFeeSats,
      amountSatsToSend: invoice.amountSats === null ? amountSats : undefined,
      idempotencyKey: 'opago-' + invoice.paymentHash,
    }), 45_000, 'Lightning payment status timed out.');
  } catch (cause) {
    recordLightningRecoveryStage('send_sdk_unresolved');
    if (feeRejectedBeforeSubmission(cause, maxFeeSats)) {
      await lifecycle?.onResolved?.(invoice.paymentHash, 'failed', 'FEE_CHANGED_BEFORE_SUBMISSION', null);
      throw new LightningFeeChangedError();
    }
    if (lifecycle) throw new LightningPaymentPendingError(invoice.paymentHash, cause);
    throw cause;
  }
  recordLightningRecoveryStage('send_sdk_returned');

  if (!result || typeof result !== 'object') throw new LightningPaymentPendingError(invoice.paymentHash);
  const requestId = typeof result.id === 'string' && result.id ? result.id : null;
  async function retainRequestId() {
    if (!requestId) return;
    try {
      await lifecycle?.onRequestIdentified?.(invoice.paymentHash, requestId);
    } catch {
      // The durable pending record remains available for reconciliation.
    }
  }
  const status = String(result.status || '').toUpperCase();
  let proof: string | null = null;
  try {
    proof = timeSendStep('proof_check', () => verifyPaymentPreimage(result.preimage || result.paymentPreimage, invoice.paymentHash));
  } catch {
    // Missing proof is not evidence of failure. Reconcile it later.
  }
  if (!proof && LIGHTNING_UNPAID_STATUSES.has(status)) {
    try {
      if (lifecycle?.onResolved) await lifecycle.onResolved(
        invoice.paymentHash,
        'failed',
        status || 'LIGHTNING_PAYMENT_FAILED',
        requestId,
      );
      else await retainRequestId();
    } catch {
      // Spark's explicit failure remains authoritative even if local activity
      // indexing is temporarily unavailable.
      await retainRequestId();
    }
    throw new Error('The Lightning network reported that this payment failed.');
  }

  if (!proof) {
    await retainRequestId();
    if (lifecycle) throw new LightningPaymentPendingError(invoice.paymentHash);
    verifyPaymentPreimage(result.preimage || result.paymentPreimage, invoice.paymentHash);
    throw new Error('Spark returned no valid payment proof.');
  }

  try {
    // Persist the verified result and request ID together. Unresolved results
    // and failed terminal writes still retain the ID separately for recovery.
    if (lifecycle?.onResolved) await timeSendStep('journal_result', () => lifecycle.onResolved!(
      invoice.paymentHash,
      'confirmed',
      status || 'PREIMAGE_VERIFIED',
      requestId,
    ));
    else await retainRequestId();
  } catch {
    // A matching preimage is authoritative. The persisted pending record can
    // be reconciled later if the local resolved-state write failed.
    await retainRequestId();
  }

  return {
    amountSats,
    paymentHash: invoice.paymentHash,
    proof,
    reference: createPaymentReference(invoice.paymentHash),
    requestId,
  };
}

export async function payDecodedSparkInvoice(
  wallet: SparkWalletLike,
  invoice: LightningInvoiceDetails,
  requestedAmountSats?: number,
  lifecycle?: LightningPaymentLifecycle,
): Promise<SparkPaymentResult> {
  const prepared = await prepareDecodedSparkPayment(wallet, invoice, requestedAmountSats);
  return payPreparedSparkPayment(wallet, prepared, lifecycle);
}

export async function paySparkInvoice(
  wallet: SparkWalletLike,
  invoiceInput: string,
  requestedAmountSats?: number,
  lifecycle?: LightningPaymentLifecycle,
): Promise<SparkPaymentResult> {
  const prepared = await prepareSparkPayment(wallet, invoiceInput, requestedAmountSats);
  return payPreparedSparkPayment(wallet, prepared, lifecycle);
}

export function sparkTransferMatchesInvoice(
  transfer: unknown,
  paymentHash: string,
  amountSats: number,
): transfer is { id: string; totalValue: number } {
  if (!transfer || typeof transfer !== 'object') return false;
  const item = transfer as {
    id?: unknown;
    transferDirection?: unknown;
    status?: unknown;
    totalValue?: unknown;
    userRequest?: {
      invoice?: { paymentHash?: unknown };
      status?: unknown;
      paymentPreimage?: unknown;
    };
  };
  const transferHash = item.userRequest?.invoice?.paymentHash;
  const isCompleted = String(item.status || '').toUpperCase() === 'COMPLETED';
  const isReceiveCompleted = String(item.userRequest?.status || '').toUpperCase() === 'TRANSFER_COMPLETED';
  const metadataMatches = (
    typeof item.id === 'string' &&
    String(item.transferDirection).toUpperCase() === 'INCOMING' &&
    (isCompleted || isReceiveCompleted) &&
    typeof transferHash === 'string' &&
    transferHash.toLowerCase() === paymentHash.toLowerCase() &&
    Number(item.totalValue) === amountSats
  );
  if (!metadataMatches) return false;
  try {
    verifyPaymentPreimage(item.userRequest?.paymentPreimage, paymentHash);
    return true;
  } catch {
    return false;
  }
}
