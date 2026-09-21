import { sha256 } from '@noble/hashes/sha256';
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

export interface SparkWalletLike {
  getBalance(): Promise<{ balance?: unknown; satsBalance?: { incoming?: unknown } }>;
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
export async function prepareDecodedSparkPayment(
  wallet: SparkWalletLike,
  invoice: LightningInvoiceDetails,
  requestedAmountSats?: number,
): Promise<PreparedSparkPayment> {
  const amountSats = resolveInvoiceAmount(invoice, requestedAmountSats);
  const balanceData = await wallet.getBalance();
  const settledBalance = Number(balanceData.balance ?? 0);
  const incomingBalance = Number(balanceData.satsBalance?.incoming ?? 0);
  if (
    !Number.isSafeInteger(settledBalance) || settledBalance < 0 ||
    !Number.isSafeInteger(incomingBalance) || incomingBalance < 0 ||
    !Number.isSafeInteger(settledBalance + incomingBalance)
  ) {
    throw new Error('Spark returned an invalid Lightning balance.');
  }
  const balanceSats = settledBalance + incomingBalance;
  if (balanceSats < amountSats) throw new Error('Insufficient Lightning balance.');
  let estimatedFeeSats: number | null = null;
  if (wallet.getLightningSendFeeEstimate) {
    try {
      estimatedFeeSats = await wallet.getLightningSendFeeEstimate({
        encodedInvoice: invoice.invoice,
        amountSats: invoice.amountSats === null ? amountSats : undefined,
      });
    } catch {
      // Do not expose SDK responses containing invoices or recipient data.
      throw new Error('The Lightning fee estimate is unavailable.');
    }
    if (!Number.isSafeInteger(estimatedFeeSats) || estimatedFeeSats < 0) {
      throw new Error('Spark returned an invalid Lightning fee estimate.');
    }
  }
  const maxFeeSats = calculateMaxLightningFee(amountSats, balanceSats, estimatedFeeSats);

  return { invoice, amountSats, maxFeeSats, estimatedFeeSats };
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
  const { invoice, amountSats, maxFeeSats } = payment;
  if (invoice.expiresAt !== null && invoice.expiresAt <= Date.now()) {
    throw new Error('The Lightning invoice has expired.');
  }

  if (lifecycle?.onPending) {
    try {
      await lifecycle.onPending(payment);
    } catch (cause) {
      if (cause instanceof Error && /already (?:being processed|paid)/i.test(cause.message)) {
        throw new LightningPaymentPendingError(invoice.paymentHash, cause);
      }
      throw cause;
    }
  }

  let result: Awaited<ReturnType<SparkWalletLike['payLightningInvoice']>>;
  try {
    assertAuthorized?.();
  } catch (cause) {
    await lifecycle?.onResolved?.(invoice.paymentHash, 'failed', 'CANCELLED_BEFORE_SUBMISSION', null);
    throw cause;
  }
  try {
    result = await wallet.payLightningInvoice({
      invoice: invoice.invoice,
      maxFeeSats,
      amountSatsToSend: invoice.amountSats === null ? amountSats : undefined,
      idempotencyKey: 'opago-' + invoice.paymentHash,
    });
  } catch (cause) {
    if (lifecycle) throw new LightningPaymentPendingError(invoice.paymentHash, cause);
    throw cause;
  }

  const requestId = typeof result.id === 'string' && result.id ? result.id : null;
  if (requestId) {
    try {
      await lifecycle?.onRequestIdentified?.(invoice.paymentHash, requestId);
    } catch {
      // The payment has already reached Spark. A local indexing failure must
      // not stop proof validation or turn a successful payment into an error.
    }
  }
  const status = String(result.status || '').toUpperCase();
  if (status.includes('FAILED')) {
    try {
      await lifecycle?.onResolved?.(
        invoice.paymentHash,
        'failed',
        status || 'LIGHTNING_PAYMENT_FAILED',
        requestId,
      );
    } catch {
      // Spark's explicit failure remains authoritative even if local activity
      // indexing is temporarily unavailable.
    }
    throw new Error('The Lightning network reported that this payment failed.');
  }

  let proof: string;
  try {
    proof = verifyPaymentPreimage(
      result.preimage || result.paymentPreimage,
      invoice.paymentHash,
    );
  } catch (cause) {
    if (lifecycle) throw new LightningPaymentPendingError(invoice.paymentHash, cause);
    throw cause;
  }

  try {
    await lifecycle?.onResolved?.(
      invoice.paymentHash,
      'confirmed',
      status || 'PREIMAGE_VERIFIED',
      requestId,
    );
  } catch {
    // A matching preimage is authoritative. The persisted pending record can
    // be reconciled later if the local resolved-state write failed.
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
  const isCompleted = String(item.status || '').toUpperCase().includes('COMPLETED');
  const isReceiveCompleted = String(item.userRequest?.status || '').toUpperCase().includes('PAID');
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
