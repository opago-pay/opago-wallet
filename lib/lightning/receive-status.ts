import { sparkTransferMatchesInvoice, verifyPaymentPreimage } from '../payments';
import { withTimeout } from '../promise-timeout';
import { loadSparkTransfersPaginated, type SparkHistoryWalletLike, type SparkUserRequestLike } from './spark-history';
import type { StoredLightningReceiveRequest } from './receive-store';

export type LightningReceiveState = 'waiting' | 'processing' | 'confirmed' | 'failed';
export interface SparkReceiveWalletLike extends SparkHistoryWalletLike {
  getLightningReceiveRequest?(id: string): Promise<SparkUserRequestLike | null>;
}

export async function resolveLightningReceive(
  wallet: SparkReceiveWalletLike,
  saved: Pick<StoredLightningReceiveRequest, 'requestId' | 'paymentHash' | 'amountSats'>,
): Promise<LightningReceiveState> {
  if (wallet.getLightningReceiveRequest) {
    try {
      const request = await withTimeout(wallet.getLightningReceiveRequest(saved.requestId), 8_000, 'Lightning request status timed out.');
      if (request?.id === saved.requestId && String(request.invoice?.paymentHash).toLowerCase() === saved.paymentHash) {
        const status = String(request.status).toUpperCase();
        if (status === 'TRANSFER_COMPLETED') {
          verifyPaymentPreimage(request.paymentPreimage, saved.paymentHash);
          return 'confirmed';
        }
        // A direct pending result does not need a full history scan every poll.
        if (status === 'INVOICE_CREATED') return 'waiting';
        if (status.endsWith('_FAILED')) return 'failed';
        return 'processing';
      }
    } catch {
      // A stale or unavailable request lookup can still be resolved by history.
    }
  }
  const transfers = await withTimeout(loadSparkTransfersPaginated(wallet, 200, 50), 12_000, 'Lightning request status timed out.');
  return transfers.some(transfer => sparkTransferMatchesInvoice(transfer, saved.paymentHash, saved.amountSats))
    ? 'confirmed' : 'processing';
}
