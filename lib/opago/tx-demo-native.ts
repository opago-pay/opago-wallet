import { randomUUID } from 'expo-crypto';
import { f3PrivateStore } from './store-native';
import { walletSession } from '../wallet-session';
import { TransactionSync, type Candidate, type SyncOwner } from './tx-sync';
import { TransactionContractTestAdapter } from './tx-test-adapter';
export async function createLocalTransactionDemo(assertSelection: () => void) {
  if (!__DEV__) throw new Error('sync_backend_pending');
  const guard = walletSession.captureRuntime(); const assertCurrent = () => { guard(); assertSelection(); };
  const installationId = await f3PrivateStore.read<string>('f5.test.installation') || randomUUID(); assertCurrent();
  await f3PrivateStore.write('f5.test.installation', installationId); assertCurrent();
  const assets = ['BTC','HBAR'] as const;
  return assets.map(asset => {
    const owner: SyncOwner = { localWalletId: 'synthetic-f5-only', source: asset === 'BTC' ? 'spark' : 'hedera',
      sourceWalletId: asset === 'BTC' ? '02' + '55'.repeat(32) : '0.0.1234', network: asset === 'BTC' ? 'regtest' : 'testnet',
      subject: 'synthetic-local-user', installationId, generation: 0 };
    const adapter = new TransactionContractTestAdapter(f3PrivateStore, owner, randomUUID, Date.now,
      asset === 'BTC' ? 'a5555555-5555-4555-8555-555555555555' : 'b5555555-5555-4555-8555-555555555555');
    const items: Candidate[] = asset === 'BTC' ? [
      { localId: 'test-btc-receive', report: { asset: 'BTC', rail: 'spark', id_source: 'SPARK_TRANSFER_ID', source_payment_id: 'synthetic-transfer',
        direction: 'incoming', sdk_status: 'TRANSFER_STATUS_COMPLETED', status: null, amount_msat: 123000 } },
      { localId: 'test-btc-send', report: { asset: 'BTC', rail: 'lightning', id_source: 'SPARK_LIGHTNING_REQUEST_ID', source_payment_id: 'synthetic-request',
        direction: 'outgoing', sdk_status: 'pending', status: 'pending', amount_msat: 45000, payment_hash: 'aa'.repeat(32) } },
    ] : [{ localId: 'test-hbar', report: { asset: 'HBAR', rail: 'hedera', id_source: 'HEDERA_TRANSACTION_ID', network: 'testnet',
      source_payment_id: '0.0.1234@1700000000.000000001', direction: 'outgoing', sdk_status: 'SUCCESS', status: 'settled',
      amount_tinybar: 123456789, counterparty_account_id: '0.0.5678', consensus_timestamp: '1700000001.000000001' } }];
    const sync = new TransactionSync(f3PrivateStore, owner, [{ id: 'synthetic-history', async read() { return { items, next: null }; } }], adapter, randomUUID, assertCurrent);
    return { asset, sync, adapter };
  });
}
