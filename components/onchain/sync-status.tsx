import { useEffect, useState } from 'react';
import { Action, Card, Copy } from '../opago/opago-ui';
import { nativeOnchainSynchronizer } from '@/lib/onchain/account-sync-native';
import type { F3Runtime } from '@/lib/opago/runtime-native';
import type { OnchainWallet } from '@/lib/onchain/types';
import { t } from '@/lib/i18n';

export function OnchainSyncStatus({runtime,wallet,active}:{runtime:F3Runtime;wallet:OnchainWallet;active:boolean}){
  const [status,setStatus]=useState<{queued:number;acknowledged:number;backendAvailable:boolean}|null>(null);
  const [revision,setRevision]=useState(0);const [failed,setFailed]=useState(false);
  useEffect(()=>{
    if(!active)return;let canceled=false,running=false;
    const update=async()=>{
      if(running||canceled)return;running=true;
      try{
        const selected=()=>{if(canceled)throw new Error('sync_owner_changed');};
        const value=nativeOnchainSynchronizer(runtime,wallet,selected);
        await value.collect();if(value.sync.port)await value.sync.flush();
        const state=await value.sync.status();selected();setStatus(state);setFailed(false);
      }catch{if(!canceled)setFailed(true);}finally{running=false;}
    };
    setStatus(null);void update();const timer=setInterval(()=>void update(),30000);
    return()=>{canceled=true;clearInterval(timer);};
  },[runtime,wallet,active,revision]);
  return <Card title="Onchain activity reports">
    {status&&<Copy>{t('Waiting to send')}: {status.queued} · {t('Reports received')}: {status.acknowledged}</Copy>}
    {!runtime.onchainSyncPort&&<Copy warning>{t('Backend synchronization is not enabled yet. Prepared reports remain on this device.')}</Copy>}
    {failed&&<Copy warning>{t(runtime.account.state.credential?'Some reports need attention. They remain on this device; no payment is sent again.':'Sign in and link your wallet to OPAGO to prepare activity reports. Your local wallet works without an OPAGO account.')}</Copy>}
    <Action label="Prepare activity reports" disabled={!active} onPress={()=>setRevision(value=>value+1)}/>
  </Card>;
}
