import { useEffect, useState } from 'react';
import { appConfig } from '@/lib/config';
import { homeBalancePreviewStore } from '@/lib/home-balance-preview-native';
import type { HomeBalancePreview } from '@/lib/home-balance-preview';
import { walletSession } from '@/lib/wallet-session';
import { recordWalletStartupStage } from '@/lib/startup-timing';

export function useHomeBalancePreview(input: {
  publicKey: string | null;
  spark: number | null;
  hedera: bigint | null;
  btcToEur: number;
  hbarToEur: number;
  sparkAt: number;
  hederaAt: number;
  ratesAt: number;
}) {
  const { publicKey, spark, hedera, btcToEur, hbarToEur, sparkAt, hederaAt, ratesAt } = input;
  const scope = publicKey ? `${publicKey}:${appConfig.hederaNetwork}:${appConfig.sparkNetwork}` : null;
  const [preview, setPreview] = useState<HomeBalancePreview | null>(null);

  useEffect(() => {
    let active = true;
    setPreview(null);
    if (!scope || !walletSession.isUnlocked()) return;
    const assertCurrent = walletSession.capture();
    void homeBalancePreviewStore.read(scope).then(saved => {
      if (!active) return;
      assertCurrent();
      setPreview(saved);
      if (saved?.spark || saved?.hedera) recordWalletStartupStage('saved_balance_available');
    }).catch(() => { /* A missing preview must never prevent live loading. */ });
    return () => { active = false; };
  }, [scope]);

  useEffect(() => {
    if (!scope || !walletSession.isUnlocked() || (spark === null && hedera === null && !(btcToEur > 0))) return;
    const next: HomeBalancePreview = { version: 1, scope };
    if (spark !== null) next.spark = { value: spark, at: sparkAt, definition: 'available' };
    if (hedera !== null) next.hedera = { value: hedera.toString(), at: hederaAt };
    if (btcToEur > 0) next.rates = { btcToEur, hbarToEur: hbarToEur > 0 ? hbarToEur : 0, at: ratesAt };
    void homeBalancePreviewStore.update(next, walletSession.capture()).catch(() => undefined);
  }, [scope, spark, hedera, btcToEur, hbarToEur, sparkAt, hederaAt, ratesAt]);

  return preview?.scope === scope ? preview : null;
}
