import type { SparkTransferLike, SparkUserRequestLike } from '../lightning/spark-history';
import type { LightningPaymentJournalRecord } from '../lightning/payment-journal';
import type { HederaPaymentJournalRecord } from '../hedera/payment-journal';
import type { MirrorTransactionRecord } from '../hedera/mirror';
import type { Candidate } from './tx-sync';
import type { Report, PaymentStatus } from './tx-contract';
import { assertTxContract } from './tx-contract';

/** The current public contract requires safe JSON integers, not decimal strings.
 * Keep BigInt until that boundary; never round a provider value. */
export function exactAmount(value: unknown, multiplier = 1n): number | null {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('sync_invalid_contract');
  if (!['number','string','bigint'].includes(typeof value) || !/^(0|[1-9][0-9]*)$/.test(String(value))) return null;
  const amount = BigInt(String(value)) * multiplier;
  return amount > 0n && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}
export function hederaTransactionId(raw: string): string {
  const parts = /^(\d+)\.(\d+)\.(\d+)(?:@(\d+)\.(\d{1,9})|-(\d+)-(\d{1,9}))$/.exec(raw);
  if (!parts) throw new Error('sync_invalid_contract');
  const id = parts.slice(1,4).map(p => BigInt(p!).toString()).join('.') + '@' + BigInt(parts[4] || parts[6]).toString() + '.' + (parts[5] || parts[7]).padStart(9,'0');
  assertTxContract('HederaTransactionId', id); return id;
}
function status(raw: unknown) {
  if (typeof raw !== 'string' || !raw || raw.length > 64) throw new Error('sync_invalid_contract');
  return raw;
}
function candidate(localId: string, report: Report): Candidate { assertTxContract('WalletPaymentReport', report); return { localId, report }; }
/** OQ-EV-3 is unresolved. Preserve exact SDK status and leave normalization null;
 * existing confirmed/failed journal results can be reported separately. */
export function sparkTransferCandidate(transfer: SparkTransferLike): Candidate {
  if (typeof transfer.id !== 'string' || !transfer.id || !['INCOMING','OUTGOING'].includes(String(transfer.transferDirection))) throw new Error('sync_invalid_contract');
  return candidate('spark-transfer:' + transfer.id, { asset: 'BTC', rail: 'spark', id_source: 'SPARK_TRANSFER_ID', source_payment_id: transfer.id,
    direction: transfer.transferDirection === 'INCOMING' ? 'incoming' : 'outgoing', sdk_status: status(transfer.status), status: null,
    amount_msat: exactAmount(transfer.totalValue, 1000n) });
}
export function sparkRequestCandidate(request: SparkUserRequestLike, paymentHash?: string | null): Candidate | null {
  if (!['LightningSendRequest','LightningReceiveRequest'].includes(String(request.typename))) return null; // On-chain/Buy/Sell have no report shape in this revision.
  if (typeof request.id !== 'string' || !request.id) throw new Error('sync_invalid_contract');
  const amount = request.transfer?.totalAmount;
  const report: Report = { asset: 'BTC', rail: 'lightning', id_source: 'SPARK_LIGHTNING_REQUEST_ID', source_payment_id: request.id,
    direction: request.typename === 'LightningReceiveRequest' ? 'incoming' : 'outgoing', sdk_status: status(request.status), status: null,
    amount_msat: amount?.originalUnit === 'SATOSHI' ? exactAmount(amount.originalValue, 1000n) : amount?.originalUnit === 'MILLISATOSHI' ? exactAmount(amount.originalValue) : null };
  if (paymentHash) report.payment_hash = paymentHash;
  else if (typeof request.invoice?.paymentHash === 'string') report.payment_hash = request.invoice.paymentHash.toLowerCase();
  // Deliberately exclude paymentPreimage, invoice, memo, tokens and client FX.
  return candidate('spark-request:' + request.id, report);
}
const journalStatus = (state: 'pending' | 'confirmed' | 'failed'): PaymentStatus => state === 'confirmed' ? 'settled' : state;
export function lightningJournalCandidate(row: LightningPaymentJournalRecord): Candidate {
  const amount = exactAmount(row.amountSats, 1000n);
  return candidate('lightning-journal:' + row.paymentHash, { asset: 'BTC', rail: 'lightning', id_source: 'SPARK_LIGHTNING_REQUEST_ID',
    source_payment_id: row.requestId, payment_hash: row.paymentHash, direction: 'outgoing', sdk_status: row.result?.slice(0,64) || row.state,
    status: row.state === 'confirmed' && !amount ? null : journalStatus(row.state), amount_msat: amount });
}
export function hederaJournalCandidate(row: HederaPaymentJournalRecord, network: 'mainnet' | 'testnet', accountId: string): Candidate | null {
  if (row.mode !== 'direct') return null; // Contract call/checkout is not native CRYPTOTRANSFER evidence in PR 593.
  const id = hederaTransactionId(row.transactionId); if (id.split('@')[0] !== accountId) throw new Error('sync_owner_changed');
  const amount = exactAmount(row.amountTinybars);
  return candidate('hedera-journal:' + id, { asset: 'HBAR', rail: 'hedera', id_source: 'HEDERA_TRANSACTION_ID', network,
    source_payment_id: id, direction: 'outgoing', sdk_status: row.result?.slice(0,64) || row.state,
    status: row.state === 'confirmed' && !amount ? null : journalStatus(row.state), amount_tinybar: amount, counterparty_account_id: row.recipientAccountId });
}
function signed(value: unknown): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value) || !/^-?(0|[1-9][0-9]*)$/.test(String(value))) throw new Error('sync_invalid_contract');
  return BigInt(String(value));
}
/** Local report preparation for the unmerged PR 593 evidence rules. Never claims backend verification. */
export function hederaMirrorCandidate(row: MirrorTransactionRecord, network: 'mainnet' | 'testnet', accountId: string): Candidate | null {
  if (row.name !== 'CRYPTOTRANSFER' || row.nonce !== 0 || row.scheduled !== false || row.result === 'DUPLICATE_TRANSACTION' ||
    row.token_transfers?.length || row.nft_transfers?.length) return null;
  if (!row.transaction_id || !Array.isArray(row.transfers)) throw new Error('sync_invalid_contract');
  const id = hederaTransactionId(row.transaction_id); const payer = id.split('@')[0];
  const fees = new Set(['0.0.98','0.0.800','0.0.801','0.0.802',row.node]);
  if (fees.has(accountId)) return null;
  const totals = new Map<string, bigint>();
  for (const t of row.transfers) { if (!t.account) throw new Error('sync_invalid_contract'); totals.set(t.account, (totals.get(t.account) || 0n) + signed(t.amount)); }
  for (const r of row.staking_reward_transfers || []) { if (!r.account) throw new Error('sync_invalid_contract'); totals.set(r.account, (totals.get(r.account) || 0n) - signed(r.amount)); }
  const fee = signed(row.charged_tx_fee); if (fee < 0n) throw new Error('sync_invalid_contract');
  if (totals.has(payer)) totals.set(payer, totals.get(payer)! + fee);
  if (!totals.has(accountId)) return null;
  const delta = totals.get(accountId)!; const amount = exactAmount(delta < 0n ? -delta : delta);
  // Zero/out-of-range evidence is explicitly unresolved, never a fabricated paid amount.
  const report: Report = { asset: 'HBAR', rail: 'hedera', id_source: 'HEDERA_TRANSACTION_ID', network, source_payment_id: id,
    direction: delta < 0n ? 'outgoing' : 'incoming', sdk_status: status(row.result), status: row.result === 'SUCCESS' && amount ? 'settled' : null, amount_tinybar: amount };
  if (row.consensus_timestamp) report.consensus_timestamp = row.consensus_timestamp;
  const counterparties = [...totals].filter(([id, value]) => id !== accountId && !fees.has(id) && delta !== 0n && value === -delta);
  if (counterparties.length === 1) report.counterparty_account_id = counterparties[0][0];
  return candidate('hedera-mirror:' + id, report);
}
