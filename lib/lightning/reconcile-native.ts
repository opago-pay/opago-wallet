import { addTransaction } from '../database';
import { createPaymentReference } from '../lightning';
import { withTimeout } from '../promise-timeout';
import { walletSession } from '../wallet-session';
import type { LightningPaymentLifecycle } from '../payments';
import { lightningPaymentJournal } from './payment-journal-native';
import {
  loadSparkTransfersPaginated,
  loadSparkLightningSendRequests,
  resolveLightningPaymentFromSpark,
  type SparkHistoryWalletLike,
  type SparkTransferLike,
  type SparkUserRequestLike,
} from './spark-history';

export async function reconcileLightningPayments(
  wallet: SparkHistoryWalletLike,
  sharedHistory: Promise<SparkTransferLike[]> | null = null,
) {
  const assertSession = walletSession.captureRuntime();
  // Pending records without a Spark request ID share one paginated history
  // read. This avoids one network scan per record after an ambiguous submit.
  let history = sharedHistory;
  let requests: Promise<SparkUserRequestLike[]> | null = null;
  const loadHistory = () => {
    history ||= loadSparkTransfersPaginated(wallet, 500, 50);
    return history;
  };
  const loadRequests = () => requests ||= loadSparkLightningSendRequests(wallet);
  const records = await lightningPaymentJournal.reconcile(record =>
    withTimeout(resolveLightningPaymentFromSpark(wallet, record, loadHistory, loadRequests), 35_000, 'Lightning reconciliation timed out.'),
  );
  await Promise.all(records.map(async record => {
    try {
      assertSession();
      await addTransaction('outgoing', record.amountSats, 'SAT', {
        txId: createPaymentReference(record.paymentHash),
        reference: record.requestId || createPaymentReference(record.paymentHash),
        status: record.state,
      });
    } catch {
      // Activity can be rebuilt from the journal and Spark history later.
    }
  }));
  return records;
}

export const lightningPaymentLifecycle: LightningPaymentLifecycle = {
  async onPending(payment) {
    await lightningPaymentJournal.recordPending(
      payment.invoice.paymentHash,
      payment.amountSats,
    );
    // Enqueue immediately to retain database write order and wipe protection,
    // but only the durable journal must finish before submission.
    void addTransaction('outgoing', payment.amountSats, 'SAT', {
      txId: createPaymentReference(payment.invoice.paymentHash),
      reference: createPaymentReference(payment.invoice.paymentHash),
      status: 'pending',
    }).catch(() => { /* Activity is rebuilt from the journal on refresh. */ });
  },

  async onRequestIdentified(paymentHash, requestId) {
    await lightningPaymentJournal.recordRequestId(paymentHash, requestId);
  },

  async onResolved(paymentHash, state, result, requestId) {
    const record = await lightningPaymentJournal.recordResolved(paymentHash, state, result, requestId);
    if (!record) return;
    void addTransaction('outgoing', record.amountSats, 'SAT', {
      txId: createPaymentReference(paymentHash),
      reference: record.requestId || createPaymentReference(paymentHash),
      status: record.state,
    }).catch(() => { /* A history write must not delay a verified result. */ });
  },
};
