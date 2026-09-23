import { sparkTransferMatchesInvoice, verifyPaymentPreimage } from '../payments';
import { withTimeout } from '../promise-timeout';
import { loadSparkTransfersPaginated, type SparkHistoryWalletLike, type SparkUserRequestLike } from './spark-history';
import type { StoredLightningReceiveRequest } from './receive-store';

export type LightningReceiveState = 'waiting' | 'processing' | 'confirmed' | 'failed';
export interface LightningReceiveOutcome {
  state: LightningReceiveState;
  amountSats: number | null;
}
export interface SparkReceiveWalletLike extends SparkHistoryWalletLike {
  getLightningReceiveRequest?(id: string): Promise<SparkUserRequestLike | null>;
}

export async function resolveLightningReceiveOutcome(
  wallet: SparkReceiveWalletLike,
  saved: Pick<StoredLightningReceiveRequest, 'requestId' | 'paymentHash' | 'amountSats'>,
): Promise<LightningReceiveOutcome> {
  if (wallet.getLightningReceiveRequest) {
    try {
      const request = await withTimeout(wallet.getLightningReceiveRequest(saved.requestId), 8_000, 'Lightning request status timed out.');
      if (request?.id === saved.requestId && String(request.invoice?.paymentHash).toLowerCase() === saved.paymentHash) {
        const status = String(request.status).toUpperCase();
        if (status === 'TRANSFER_COMPLETED') {
          verifyPaymentPreimage(request.paymentPreimage, saved.paymentHash);
          const original = Number(request.transfer?.totalAmount?.originalValue);
          const unit = String(request.transfer?.totalAmount?.originalUnit || '');
          const received = unit === 'SATOSHI' ? original :
            unit === 'MILLISATOSHI' ? original / 1000 : NaN;
          const amountSats = saved.amountSats || (Number.isSafeInteger(received) && received > 0 ? received : null);
          if (amountSats !== null && (saved.amountSats === 0 || received === saved.amountSats || !request.transfer)) {
            return { state: 'confirmed', amountSats };
          }
          if (saved.amountSats > 0) return { state: 'processing', amountSats: null };
          // Some SSP responses omit the transfer. History can still supply
          // the received amount for an open invoice.
          throw new Error('Lightning receive amount not available yet.');
        }
        // A direct pending result does not need a full history scan every poll.
        if (status === 'INVOICE_CREATED') return { state: 'waiting', amountSats: null };
        if (status.endsWith('_FAILED')) return { state: 'failed', amountSats: null };
        return { state: 'processing', amountSats: null };
      }
    } catch {
      // A stale or unavailable request lookup can still be resolved by history.
    }
  }
  const transfers = await withTimeout(loadSparkTransfersPaginated(wallet, 200, 50), 12_000, 'Lightning request status timed out.');
  const matched = transfers.find(transfer => sparkTransferMatchesInvoice(transfer, saved.paymentHash, saved.amountSats));
  return matched
    ? { state: 'confirmed', amountSats: saved.amountSats || Number(matched.totalValue) }
    : { state: 'processing', amountSats: null };
}

export async function resolveLightningReceive(
  wallet: SparkReceiveWalletLike,
  saved: Pick<StoredLightningReceiveRequest, 'requestId' | 'paymentHash' | 'amountSats'>,
): Promise<LightningReceiveState> {
  return (await resolveLightningReceiveOutcome(wallet, saved)).state;
}
