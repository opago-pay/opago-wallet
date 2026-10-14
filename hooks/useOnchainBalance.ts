import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useWalletAuth } from './useWalletAuth';
import { failedBalance, loadedBalance, refreshingBalance, unknownBalance, type BalanceState } from '../lib/balance-state';
import { onchainJournal } from '../lib/onchain/journal-native';
import type { OnchainBalance, OnchainOperation, OnchainTransaction } from '../lib/onchain/types';

export function useOnchainBalance() {
  const { onchainWallet:wallet,onchainError }=useWalletAuth();
  const [snapshot,setSnapshot]=useState<{scope:string|null;state:BalanceState<OnchainBalance>;operations:OnchainOperation[];transactions:OnchainTransaction[]}>({
    scope:null,state:unknownBalance(),operations:[],transactions:[],
  });
  const generation=useRef(0);
  const refresh=useCallback(async () => {
    const current=generation.current;
    if (!wallet) return;
    setSnapshot(previous=>({scope:wallet.scope,state:refreshingBalance(previous.scope===wallet.scope?previous.state:unknownBalance()),operations:previous.scope===wallet.scope?previous.operations:[],transactions:previous.scope===wallet.scope?previous.transactions:[]}));
    try {
      const balance=await wallet.sync();
      const [operations,transactions]=await Promise.all([onchainJournal().list(wallet.scope),wallet.transactions()]);
      if (current!==generation.current) return;
      setSnapshot({scope:wallet.scope,state:loadedBalance(balance),operations,transactions});
    } catch(cause) {
      if (current!==generation.current) return;
      setSnapshot(previous=>({scope:wallet.scope,state:failedBalance(previous.scope===wallet.scope?previous.state:unknownBalance(),cause),operations:previous.scope===wallet.scope?previous.operations:[],transactions:previous.scope===wallet.scope?previous.transactions:[]}));
    }
  },[wallet]);
  useEffect(()=>{
    const effectGeneration=++generation.current;
    if (!wallet) {setSnapshot({scope:null,state:onchainError?failedBalance(unknownBalance(),new Error(onchainError)):unknownBalance(),operations:[],transactions:[]});return;}
    void refresh();
    const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},20_000);
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
    return()=>{generation.current=effectGeneration+1;clearInterval(timer);subscription.remove();};
  },[wallet,onchainError,refresh]);
  const matching=wallet && snapshot.scope===wallet.scope;
  return {network:wallet?.network,state:matching?snapshot.state:onchainError?failedBalance(unknownBalance<OnchainBalance>(),new Error(onchainError)):unknownBalance<OnchainBalance>(),
    operations:matching?snapshot.operations:[],transactions:matching?snapshot.transactions:[],refresh};
}
