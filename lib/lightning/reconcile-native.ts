import { addTransaction } from '../database';
import { createPaymentReference } from '../lightning';
import type { LightningPaymentLifecycle } from '../payments';
import { lightningPaymentJournal } from './payment-journal-native';
import {
  loadSparkTransfersPaginated,
  resolveLightningPaymentFromSpark,
  type SparkHistoryWalletLike,
  type SparkTransferLike,
} from './spark-history';

export async function reconcileLightningPayments(
  wallet: SparkHistoryWalletLike,
  sharedHistory: Promise<SparkTransferLike[]> | null = null,
) {
  // Pending records without a Spark request ID share one paginated history
  // read. This avoids one network scan per record after an ambiguous submit.
  let history = sharedHistory;
  const loadHistory = () => {
    history ||= loadSparkTransfersPaginated(wallet, 500, 50);
    return history;
  };
  const records = await lightningPaymentJournal.reconcile(record =>
    resolveLightningPaymentFromSpark(wallet, record, loadHistory),
  );
  await Promise.all(records.map(async record => {
    try {
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
    try {
      await addTransaction('outgoing', payment.amountSats, 'SAT', {
        txId: createPaymentReference(payment.invoice.paymentHash),
        reference: createPaymentReference(payment.invoice.paymentHash),
        status: 'pending',
      });
    } catch {
      // The journal is the safety boundary. Activity is a rebuildable index
      // and must not block submission after pending state is durable.
    }
  },

  async onRequestIdentified(paymentHash, requestId) {
    await lightningPaymentJournal.recordRequestId(paymentHash, requestId);
  },

  async onResolved(paymentHash, state, result, requestId) {
    await lightningPaymentJournal.recordResolved(paymentHash, state, result, requestId);
    const record = await lightningPaymentJournal.get(paymentHash);
    if (!record) return;
    await addTransaction('outgoing', record.amountSats, 'SAT', {
      txId: createPaymentReference(paymentHash),
      reference: requestId || createPaymentReference(paymentHash),
      status: state,
    });
  },
};
