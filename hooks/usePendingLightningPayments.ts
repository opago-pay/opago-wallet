import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { lightningPaymentJournal } from '@/lib/lightning/payment-journal-native';
import { lightningPaymentPresentation } from '@/lib/lightning/payment-journal';
import { reconcileLightningPayments } from '@/lib/lightning/reconcile-native';
import type { SparkHistoryWalletLike } from '@/lib/lightning/spark-history';
import { yieldToUi } from '@/lib/ui-ready';

// Only unresolved submissions need automatic network checks. Ordinary history
// remains opt-in, and this hook starts only after the primary balance has settled.
export function usePendingLightningPayments(
  wallet: SparkHistoryWalletLike | null,
  enabled: boolean,
  onResolved: () => Promise<unknown>,
  visibilityRevision = 0,
) {
  const [presentation, setPresentation] = useState({ pendingCount: 0, hiddenPaymentKeys: [] as string[] });
  const resolvedCallback = useRef(onResolved);
  resolvedCallback.current = onResolved;

  useFocusEffect(useCallback(() => {
    // A visibility edit invalidates the local snapshot even if the wallet and
    // network readiness are unchanged. Refresh it immediately after the edit.
    void visibilityRevision;
    if (!wallet || !enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      try {
        await yieldToUi();
        if (cancelled) return;
        const records = await lightningPaymentJournal.list();
        const before = records.filter(record => record.state === 'pending');
        if (cancelled) return;
        setPresentation(lightningPaymentPresentation(records));
        if (!before.length) return;
        const after = await reconcileLightningPayments(wallet!, null, records);
        if (cancelled) return;
        const remaining = after.filter(record => record.state === 'pending').length;
        setPresentation(lightningPaymentPresentation(after));
        if (remaining < before.length) void resolvedCallback.current().catch(() => undefined);
        if (!remaining) return;
      } catch {
        // An unavailable status service must not become a failure or a resend.
      }
      if (!cancelled) timer = setTimeout(() => void check(), 15_000);
    }
    void check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [wallet, enabled, visibilityRevision]));
  return presentation;
}
