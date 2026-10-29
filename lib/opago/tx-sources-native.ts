import type { BitcoinSparkWallet } from '../spark-bitcoin-wallet';
import { withTimeout } from '../promise-timeout';
import { loadSparkTransferPage, sparkUserRequestPaymentHash, type SparkHistoryWalletLike } from '../lightning/spark-history';
import { lightningPaymentJournalFor } from '../lightning/payment-journal-native';
import { hederaPaymentJournalFor } from '../hedera/payment-journal-native';
import { listArchivedBitcoinRequests } from '../bitcoin/receive-archive';
import { bitcoinStore } from '../bitcoin/store-native';
import { listMirrorTransactionsForSync } from '../hedera/mirror';
import { sparkTransferCandidate, sparkRequestCandidate, lightningJournalCandidate, hederaJournalCandidate, hederaMirrorCandidate, exactAmount } from './tx-sources';
import type { Candidate, SyncSource } from './tx-sync';
export function sparkSyncSources(wallet: BitcoinSparkWallet, network: 'MAINNET' | 'REGTEST', publicKey: string, sparkIdentity: string): SyncSource[] {
  const history = wallet as unknown as SparkHistoryWalletLike;
  const journal = lightningPaymentJournalFor(network, publicKey);
  const streams: SyncSource[] = [
    { id: 'spark-transfers', async read(cursor) {
      if (cursor !== null && !/^(0|[1-9][0-9]*)$/.test(cursor)) throw new Error('sync_invalid_contract');
      const offset = cursor === null ? 0 : Number(cursor); if (!Number.isSafeInteger(offset)) throw new Error('sync_invalid_contract');
      const page = await loadSparkTransferPage(history, 50, offset);
      return { items: page.transfers.map(sparkTransferCandidate), next: page.next === null ? null : String(Math.max(offset + 1, page.next - 5)) };
    } },
    { id: 'spark-requests', async read(cursor) {
      if (!history.getUserRequests) throw new Error('sync_invalid_contract');
      const page = await withTimeout(history.getUserRequests({ first: 50, after: cursor || undefined }), 8000, 'sync_network');
      if (!Array.isArray(page?.entities) || !page.pageInfo || page.pageInfo.hasNextPage && !page.pageInfo.endCursor) throw new Error('sync_invalid_contract');
      const items = page.entities.map(request => sparkRequestCandidate(request, sparkUserRequestPaymentHash(request)));
      return { items: items.filter((row): row is Candidate => row !== null), skipped: items.filter(row => row === null).length,
        next: page.pageInfo.hasNextPage ? page.pageInfo.endCursor! : null };
    } },
    { id: 'lightning-journal', async read() { return { items: (await journal.list()).map(lightningJournalCandidate), next: null }; } },
    { id: 'lightning-receives', async read() {
      const rows = await listArchivedBitcoinRequests(network + ':' + sparkIdentity.toLowerCase());
      return { items: rows.map(row => ({ localId: 'spark-request:' + row.requestId, report: {
        asset: 'BTC', rail: 'lightning', id_source: 'SPARK_LIGHTNING_REQUEST_ID', source_payment_id: row.requestId, payment_hash: row.paymentHash,
        direction: 'incoming', sdk_status: row.state, status: row.state === 'confirmed' && exactAmount(row.amountSats, 1000n) ? 'settled' : row.state === 'failed' ? 'failed' : 'pending',
        amount_msat: exactAmount(row.amountSats, 1000n) } } as Candidate)), next: null };
    } },
    { id: 'bitcoin-operations', async read() {
      const rows = await bitcoinStore.list(network + ':' + sparkIdentity.toLowerCase());
      // v3 has no on-chain request report namespace. Use only a real Spark transfer identity;
      // retain everything else in the existing operation store for the future contract extension.
      const supported = rows.filter(row => row.transferId);
      return { items: supported.map(row => ({ localId: 'spark-transfer:' + row.transferId, report: { asset: 'BTC', rail: 'spark',
        id_source: 'SPARK_TRANSFER_ID', source_payment_id: row.transferId!, direction: row.kind === 'deposit' ? 'incoming' : 'outgoing',
        sdk_status: row.state, status: row.state === 'confirmed' && exactAmount(row.amountSats, 1000n) ? 'settled' : null,
        amount_msat: exactAmount(row.amountSats, 1000n) } } as Candidate)), skipped: rows.length - supported.length, next: null };
    } },
  ];
  return [
    { id: 'spark-transfers-head', async read() { const page = await streams[0].read(null); return { ...page, next: null }; } },
    { id: 'spark-requests-head', async read() { const page = await streams[1].read(null); return { ...page, next: null }; } },
    ...streams,
  ];
}
export function hederaSyncSources(network: 'mainnet' | 'testnet', publicKey: string, accountId: string): SyncSource[] {
  const journal = hederaPaymentJournalFor(network, publicKey);
  const streams: SyncSource[] = [
    { id: 'hedera-mirror', async read(cursor) {
      const page = await listMirrorTransactionsForSync(accountId, cursor);
      const items = page.transactions.map(row => hederaMirrorCandidate(row, network, accountId));
      return { items: items.filter((item): item is Candidate => item !== null), next: page.next, skipped: items.filter(item => item === null).length };
    } },
    { id: 'hedera-journal', async read() {
      const items = (await journal.list()).map(row => hederaJournalCandidate(row, network, accountId));
      return { items: items.filter((item): item is Candidate => item !== null), next: null, skipped: items.filter(item => item === null).length };
    } },
  ];
  return [{ id: 'hedera-mirror-head', async read() { const page = await streams[0].read(null); return { ...page, next: null }; } }, ...streams];
}
