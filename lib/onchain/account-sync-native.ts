import { randomUUID } from 'expo-crypto';
import { OnchainAccountSync, onchainEvents } from './account-sync';
import { onchainJournal } from './journal-native';
import type { OnchainWallet } from './types';
import type { F3Runtime } from '../opago/runtime-native';
import { f3PrivateStore } from '../opago/store-native';
import { walletSession } from '../wallet-session';

export function nativeOnchainSynchronizer(runtime:F3Runtime,wallet:OnchainWallet,selection:()=>void){
  const account=runtime.account, state=account.state;
  const subject=state.credential?.subject, generation=state.syncGeneration||0, walletId=state.wallet?.wallet_id;
  if(runtime.testOnly||!subject||!walletId||state.deletion||state.syncPaused||state.wallet?.status!=='active'||!state.wallet.party_id)throw new Error('sync_owner_changed');
  const session=walletSession.captureRuntime();
  const guard=()=>{
    session();selection();const now=account.state;
    if(now.credential?.subject!==subject||(now.syncGeneration||0)!==generation||now.wallet?.wallet_id!==walletId||now.wallet?.status!=='active'||!now.wallet?.party_id||now.deletion||now.syncPaused)throw new Error('sync_owner_changed');
  };
  const sync=new OnchainAccountSync(f3PrivateStore,{subject,generation,scope:wallet.scope,installationId:account.installationId},runtime.onchainSyncPort??null,randomUUID,guard);
  return {sync,async collect(){
    guard();const transactions=await wallet.transactions();guard();
    const operations=await onchainJournal().list(wallet.scope);guard();
    await sync.collect(onchainEvents(wallet.network,transactions,operations));
  }};
}
