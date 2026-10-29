import { randomUUID } from 'expo-crypto';
import type { F3Runtime } from './runtime-native';
import type { BitcoinSparkWallet } from '../spark-bitcoin-wallet';
import { appConfig } from '../config';
import { HEDERA_NETWORK } from '../hedera/config';
import { walletSession } from '../wallet-session';
import { f3PrivateStore } from './store-native';
import { TransactionSync, SyncError, type SyncOwner } from './tx-sync';
import { sparkSyncSources, hederaSyncSources } from './tx-sources-native';
export async function nativeTransactionSynchronizers(runtime: F3Runtime, wallet: BitcoinSparkWallet | null, publicKey: string | null,
  accountId: string | null, assertSelection: () => void) {
  if (runtime.testOnly || !publicKey) throw new SyncError('sync_owner_changed');
  if (runtime.transactionSyncPort && runtime.transactionSyncPort.mode !== 'hka') throw new SyncError('sync_owner_changed');
  const account = runtime.account; const sessionGuard = walletSession.captureRuntime();
  const subject = account.state.credential?.subject; const generation = account.state.syncGeneration || 0;
  const localId = account.state.wallet?.wallet_id;
  if (!subject || !localId || account.state.deletion || account.state.syncPaused || account.state.wallet?.status !== 'active' || !account.state.wallet.party_id) throw new SyncError('sync_session_expired');
  const assertCurrent = () => {
    sessionGuard(); assertSelection();
    if (account.state.credential?.subject !== subject || account.state.deletion || account.state.syncPaused || (account.state.syncGeneration || 0) !== generation ||
      account.state.wallet?.wallet_id !== localId || account.state.wallet.status !== 'active' || !account.state.wallet.party_id) throw new SyncError('sync_owner_changed');
  };
  const base = { localWalletId: localId + ':' + publicKey, subject, installationId: account.installationId, generation };
  const result: { asset: 'BTC' | 'HBAR'; sync: TransactionSync }[] = [];
  if (wallet) {
    const key = await wallet.getIdentityPublicKey(); assertCurrent();
    const owner: SyncOwner = { ...base, source: 'spark', sourceWalletId: key, network: appConfig.isMainnet ? 'mainnet' : 'regtest' };
    result.push({ asset: 'BTC', sync: new TransactionSync(f3PrivateStore, owner, sparkSyncSources(wallet, appConfig.sparkNetwork, publicKey, key), runtime.transactionSyncPort || null, randomUUID, assertCurrent) });
  }
  if (accountId) {
    const owner: SyncOwner = { ...base, source: 'hedera', sourceWalletId: accountId, network: HEDERA_NETWORK };
    result.push({ asset: 'HBAR', sync: new TransactionSync(f3PrivateStore, owner, hederaSyncSources(HEDERA_NETWORK, publicKey, accountId), runtime.transactionSyncPort || null, randomUUID, assertCurrent) });
  }
  return result;
}
