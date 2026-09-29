import { addTransaction } from '../database';
import { createPaymentReference } from '../lightning';
import { withTimeout } from '../promise-timeout';
import { walletSession } from '../wallet-session';
import type { LightningPaymentLifecycle } from '../payments';
import { lightningPaymentJournalFor } from './payment-journal-native';
import type { LightningPaymentJournalRecord } from './payment-journal';
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
  scope: { network: 'MAINNET' | 'REGTEST'; publicKey: string },
  sharedHistory: Promise<SparkTransferLike[]> | null = null,
  pendingSnapshot?: LightningPaymentJournalRecord[],
) {
  const lightningPaymentJournal = lightningPaymentJournalFor(scope.network, scope.publicKey);
  const assertSession = walletSession.captureRuntime();
  const before = pendingSnapshot ?? await lightningPaymentJournal.list();
  assertSession();
  if (!before.some(record => record.state === 'pending')) return before;
  const previousByHash = new Map(before.map(record => [record.paymentHash, record]));
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
  await Promise.all(records.filter(record => {
    const previous = previousByHash.get(record.paymentHash);
    return !previous || previous.state !== record.state || previous.requestId !== record.requestId;
  }).map(async record => {
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

export function lightningPaymentLifecycle(scope: { network: 'MAINNET' | 'REGTEST'; publicKey: string }): LightningPaymentLifecycle {
  const lightningPaymentJournal = lightningPaymentJournalFor(scope.network, scope.publicKey);
  const assertSession = walletSession.captureRuntime();
  return {
  async onPending(payment) {
    assertSession();
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
    try { assertSession(); }
    catch { return; } // The old scope remains reconciled; never index it into a new wallet's local activity.
    void addTransaction('outgoing', record.amountSats, 'SAT', {
      txId: createPaymentReference(paymentHash),
      reference: record.requestId || createPaymentReference(paymentHash),
      status: record.state,
    }).catch(() => { /* A history write must not delay a verified result. */ });
  },
  };
}
