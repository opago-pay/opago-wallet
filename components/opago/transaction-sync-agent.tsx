import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useWalletAuth } from '../../hooks/useWalletAuth';
import { nativeF3Enabled } from '../../lib/opago/settings-native';
/** Bounded foreground report recovery only. Neither local payments nor unlock
 * depend on this optional account service; no signing or send method is called. */
export function TransactionSyncAgent() {
  const { sparkWallet, hederaPublicKey, hederaAccount, isLocked } = useWalletAuth();
  useEffect(() => {
    let active = true; let running = false;
    const assertCurrent = () => { if (!active || isLocked || AppState.currentState !== 'active') throw new Error('sync_owner_changed'); };
    async function recover() {
      if (running || !active || isLocked || AppState.currentState !== 'active' || !nativeF3Enabled()) return;
      running = true;
      try {
        const { getF3Runtime } = await import('../../lib/opago/runtime-native');
        const { nativeTransactionSynchronizers } = await import('../../lib/opago/tx-runtime-native'); assertCurrent();
        const runtime = await getF3Runtime(sparkWallet, hederaPublicKey); assertCurrent();
        if (!runtime.account.state.credential || !runtime.account.state.wallet?.party_id) return;
        const items = await nativeTransactionSynchronizers(runtime, sparkWallet, hederaPublicKey, hederaAccount?.accountId || null, assertCurrent);
        await Promise.allSettled(items.map(async item => {
          try { await item.sync.collect(6); } catch { assertCurrent(); } // Other streams/queued reports can still progress during source outages.
          if (item.sync.port) { await item.sync.flush(10); await item.sync.refreshReceipts(10); }
        }));
      } catch { /* Private data and remote errors are never logged. The status page exposes recovery. */ }
      finally { running = false; }
    }
    void recover(); const timer = setInterval(() => void recover(), 30_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void recover(); });
    return () => { active = false; clearInterval(timer); sub.remove(); };
  }, [sparkWallet, hederaPublicKey, hederaAccount?.accountId, isLocked]);
  return null;
}
