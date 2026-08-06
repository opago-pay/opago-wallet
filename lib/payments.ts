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
}

export interface SparkWalletLike {
  getBalance(): Promise<{ balance?: unknown; satsBalance?: { incoming?: unknown } }>;
  payLightningInvoice(input: {
    invoice: string;
    maxFeeSats: number;
    amountSatsToSend?: number;
    idempotencyKey?: string;
  }): Promise<{ preimage?: string; paymentPreimage?: string }>;
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
export async function payDecodedSparkInvoice(
  wallet: SparkWalletLike,
  invoice: LightningInvoiceDetails,
  requestedAmountSats?: number,
): Promise<SparkPaymentResult> {
  const amountSats = resolveInvoiceAmount(invoice, requestedAmountSats);
  const balanceData = await wallet.getBalance();
  const balanceSats =
    (Number(balanceData.balance) || 0) + (Number(balanceData.satsBalance?.incoming) || 0);
  const maxFeeSats = calculateMaxLightningFee(amountSats, balanceSats);

  const result = await wallet.payLightningInvoice({
    invoice: invoice.invoice,
    maxFeeSats,
    amountSatsToSend: invoice.amountSats === null ? amountSats : undefined,
    idempotencyKey: 'opago-' + invoice.paymentHash,
  });
  const proof = verifyPaymentPreimage(
    result.preimage || result.paymentPreimage,
    invoice.paymentHash,
  );

  return {
    amountSats,
    paymentHash: invoice.paymentHash,
    proof,
    reference: createPaymentReference(invoice.paymentHash),
  };
}

export async function paySparkInvoice(
  wallet: SparkWalletLike,
  invoiceInput: string,
  requestedAmountSats?: number,
): Promise<SparkPaymentResult> {
  return payDecodedSparkInvoice(wallet, decodeLightningInvoice(invoiceInput), requestedAmountSats);
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
    userRequest?: { invoice?: { paymentHash?: unknown }; status?: unknown };
  };
  const transferHash = item.userRequest?.invoice?.paymentHash;
  const isCompleted = String(item.status || '').toUpperCase().includes('COMPLETED');
  const isReceiveCompleted = String(item.userRequest?.status || '').toUpperCase().includes('PAID');
  return (
    typeof item.id === 'string' &&
    String(item.transferDirection).toUpperCase() === 'INCOMING' &&
    (isCompleted || isReceiveCompleted) &&
    typeof transferHash === 'string' &&
    transferHash.toLowerCase() === paymentHash.toLowerCase() &&
    Number(item.totalValue) === amountSats
  );
}
