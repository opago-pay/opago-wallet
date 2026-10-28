import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { walletSession } from '@/lib/wallet-session';
import { reconcileMoves } from '@/lib/onchain/transfers';

export function TransferAgent(){
  const {onchainWallet,sparkWallet,isLocked}=useWalletAuth();
  useEffect(()=>{
    if(isLocked||!onchainWallet||!sparkWallet)return;
    let cancelled=false,running=false;
    const run=async()=>{
      if(running||cancelled||AppState.currentState!=='active')return;running=true;
      try{
        const session=walletSession.captureRuntime();
        await reconcileMoves(onchainWallet,sparkWallet,()=>{session();if(cancelled)throw new Error('Wallet changed.');});
      }catch{/* The durable journal keeps unresolved transfers for the next foreground attempt. */}
      finally{running=false;}
    };
    void run();const timer=setInterval(()=>void run(),20_000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[onchainWallet,sparkWallet,isLocked]);
  return null;
}
