import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { useOpagoAccount } from '../hooks/useOpagoAccount';
import { OpagoPage, Action, Card, Copy } from '../components/opago/opago-ui';
import { nativeTransactionSynchronizers } from '../lib/opago/tx-runtime-native';
import { createLocalTransactionDemo } from '../lib/opago/tx-demo-native';
import { syncUserError, SyncError, type TransactionSync } from '../lib/opago/tx-sync';
import type { TransactionContractTestAdapter } from '../lib/opago/tx-test-adapter';
import { t } from '../lib/i18n';
type Item = { asset: 'BTC' | 'HBAR'; sync: TransactionSync; adapter?: TransactionContractTestAdapter };
type Snapshot = Awaited<ReturnType<TransactionSync['snapshot']>>;
export default function TransactionSyncScreen() {
  const params = useLocalSearchParams<{ test?: string }>(); const router = useRouter();
  const [testOnly, setTestOnly] = useState(__DEV__ && params.test === '1');
  const { runtime } = useOpagoAccount(false);
  const { sparkWallet, hederaPublicKey, hederaAccount } = useWalletAuth();
  const focused = useIsFocused(); const [active, setActive] = useState(AppState.currentState === 'active');
  const [items, setItems] = useState<Item[]>([]); const [snapshots, setSnapshots] = useState<Partial<Record<'BTC' | 'HBAR', Snapshot>>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const generation = useRef(0); const running = useRef(false);
  useEffect(() => { const sub = AppState.addEventListener('change', state => setActive(state === 'active')); return () => sub.remove(); }, []);
  useEffect(() => {
    const lifecycle = generation; const current = ++lifecycle.current; setItems([]); setSnapshots({}); setError('');
    const guard = () => { if (current !== generation.current || !focused || !active) throw new SyncError('sync_owner_changed'); };
    if (!focused || !active || !testOnly && !runtime) return;
    const pending = testOnly ? createLocalTransactionDemo(guard) : nativeTransactionSynchronizers(runtime!, sparkWallet, hederaPublicKey, hederaAccount?.accountId || null, guard);
    pending.then(async value => {
      guard(); const state: Partial<Record<'BTC' | 'HBAR', Snapshot>> = {};
      for (const item of value) state[item.asset] = await item.sync.snapshot(); guard(); setItems(value); setSnapshots(state);
    }).catch(cause => { if (current === generation.current) setError(syncUserError(cause)); });
    return () => { lifecycle.current = current + 1; };
  }, [runtime, sparkWallet, hederaPublicKey, hederaAccount?.accountId, testOnly, focused, active]);
  async function run(action: (item: Item) => Promise<unknown>) {
    if (running.current || !focused || !active) return;
    const current = generation.current; running.current = true; setBusy(true); setError('');
    try {
      const results = await Promise.allSettled(items.map(action));
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    } catch (cause) { if (current === generation.current) setError(syncUserError(cause)); }
    finally {
      if (current === generation.current) {
        const next: Partial<Record<'BTC' | 'HBAR', Snapshot>> = {};
        for (const item of items) { try { next[item.asset] = await item.sync.snapshot(); } catch { /* The lifecycle guard owns this transition. */ } }
        if (current === generation.current) setSnapshots(next);
      }
      running.current = false; setBusy(false);
    }
  }
  return <OpagoPage title="Transaction synchronization" testOnly={testOnly} busy={busy} error={error}>
    <Copy>{t('Your balances and payment history come from your wallet. Synchronization reports activity to OPAGO and never sends a payment again.')}</Copy>
    <Action label="Open OPAGO account" disabled={busy} onPress={() => router.push('/opago-account')} />
    {!items.length && <Card title="Synchronization not connected"><Copy>{t('Sign in and link your wallet to OPAGO to prepare activity reports. Your local wallet works without an OPAGO account.')}</Copy></Card>}
    {items.map(item => {
      const status = snapshots[item.asset];
      return <Card key={item.asset} title={item.asset === 'BTC' ? 'BTC activity reports' : 'HBAR activity reports'}>
        <Copy>{t('Waiting to send')}: {status?.queued || 0} · {t('Reports received')}: {status?.acknowledged || 0}</Copy>
        <Copy>{t('Payment observations')}: {t('Pending')}: {status?.pending || 0} · {t('Settled')}: {status?.settled || 0} · {t('Failed or canceled')}: {status?.failed || 0} · {t('Unknown')}: {status?.unknown || 0}</Copy>
        <Copy>{t('Awaiting independent evidence')}: {(status?.provisional || 0) + (status?.unresolved || 0)} · {t('Reports independently checked')}: {status?.verified || 0}</Copy>
        {!!status?.blocked && <Copy warning>{t('Some reports need attention. They remain on this device; no payment is sent again.')}</Copy>}
        {!status?.backendAvailable && <Copy warning>{t('Backend synchronization is not enabled yet. Prepared reports remain on this device.')}</Copy>}
        {item.asset === 'HBAR' && <Copy warning>{t('A local Hedera account selection does not authorize OPAGO reporting. Backend wallet ownership proof and HBAR enablement are required.')}</Copy>}
        {Object.entries(status?.sources || {}).map(([source, progress]) => <Copy key={source}>{t('History pages read')}: {progress.pages}{progress.skipped > 0 ? ' · ' + t('Some activity needs a future report format and remains in wallet history.') : ''}</Copy>)}
      </Card>;
    })}
    {!!items.length && <>
      <Action label="Prepare activity reports" disabled={busy} onPress={() => void run(item => item.sync.collect())} />
      <Action label="Retry report delivery" disabled={busy || items.every(item => !item.sync.port)} onPress={() => void run(item => item.sync.port ? item.sync.flush() : Promise.resolve())} />
      <Action label="Check report evidence" disabled={busy || items.every(item => !item.sync.port)} onPress={() => void run(item => item.sync.port ? item.sync.refreshReceipts() : Promise.resolve())} />
    </>}
    <Copy>{t('A received report is not a confirmed payment. OPAGO checks independent evidence and calculates its own EUR value. Buy, Sell, Fiat and Swap reporting await a future contract.')}</Copy>
    {testOnly && <Card title="Local test controls">
      <Copy warning>{t('Synthetic data only. These controls cannot change a real payment, POS device or backend wallet. HBAR is blocked by the current contract.')}</Copy>
      <Action label="Simulate a lost response" disabled={busy} onPress={() => void run(async item => { item.adapter!.loseNextResponse = true; })} />
      <Action label="Simulate temporary backend outage" disabled={busy} onPress={() => void run(async item => { item.adapter!.rejectNext = new SyncError('upstream_unavailable', true, 5); })} />
      <Action label="Simulate session expiry" disabled={busy} onPress={() => void run(async item => { item.adapter!.expired = true; })} />
      <Action label="Renew synthetic session and allow proposed HBAR tests" disabled={busy} onPress={() => void run(async item => { item.adapter!.expired = false; item.adapter!.enabledHbar = true; await item.sync.retryDisabledReports(); })} />
      <Action label="Simulate independent evidence" disabled={busy} onPress={() => void run(async item => { await item.adapter!.verifyTestEvidence(); })} />
    </Card>}
    {__DEV__ && !testOnly && <Action label="Open local synchronization test adapter" disabled={busy} onPress={() => setTestOnly(true)} />}
    {testOnly && <Action label="Leave local test adapter" disabled={busy} onPress={() => setTestOnly(false)} />}
  </OpagoPage>;
}
