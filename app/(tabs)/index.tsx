import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { getTransactions, Transaction as LocalTransaction } from '@/lib/database';
import { getSolanaBalances, getSolanaHistory } from '@/lib/solana';
import { appConfig } from '@/lib/config';

interface DisplayTransaction {
  key: string;
  type: 'incoming' | 'outgoing';
  amount: number;
  asset: string;
  status: string;
  timestamp: string;
  txId: string | null;
}

export default function HomeScreen() {
  const { walletReady, sparkWallet, solanaKeypair, loadOrGenerateWallet } = useWalletAuth();
  const rates = useExchangeRates();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState({ spark: 0, sol: 0, usdc: 0 });
  const [transactions, setTransactions] = useState<DisplayTransaction[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!walletReady) {
      await loadOrGenerateWallet();
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const local = await getTransactions();
      const remote: DisplayTransaction[] = [];

      if (sparkWallet) {
        const [balance, transferResult] = await Promise.all([
          sparkWallet.getBalance(),
          sparkWallet.getTransfers(20, 0),
        ]);
        setBalances(current => ({
          ...current,
          spark: (Number(balance.balance) || 0) + (Number(balance.satsBalance?.incoming) || 0),
        }));

        for (const transfer of transferResult.transfers || []) {
          const status = String(transfer.status || '').toUpperCase();
          if (!status.includes('COMPLETED')) continue;
          const amount = Math.abs(Number(transfer.totalValue) || 0);
          if (amount <= 0) continue;
          const paymentHash = String(transfer.userRequest?.invoice?.paymentHash || '');
          const key = /^[a-f0-9]{64}$/i.test(paymentHash)
            ? 'ln:' + paymentHash.toLowerCase()
            : 'spark:' + transfer.id;
          remote.push({
            key,
            txId: key,
            type: String(transfer.transferDirection).toUpperCase() === 'INCOMING' ? 'incoming' : 'outgoing',
            amount,
            asset: 'SAT',
            status: 'confirmed',
            timestamp: transfer.createdTime
              ? new Date(transfer.createdTime).toISOString()
              : new Date().toISOString(),
          });
        }
      }

      if (solanaKeypair) {
        const [solanaBalances, history] = await Promise.all([
          getSolanaBalances(solanaKeypair.publicKey),
          getSolanaHistory(solanaKeypair.publicKey),
        ]);
        setBalances(current => ({ ...current, ...solanaBalances }));
        remote.push(...history.map(item => ({ ...item, key: item.txId })));
      }

      const localDisplay = local.map((item: LocalTransaction): DisplayTransaction => ({
        key: item.txId || 'local:' + item.id,
        txId: item.txId,
        type: item.type,
        amount: item.amount,
        asset: item.asset,
        status: item.status,
        timestamp: item.timestamp,
      }));
      const byId = new Map<string, DisplayTransaction>();
      for (const item of localDisplay) byId.set(item.key, item);
      for (const item of remote) {
        const localItem = byId.get(item.key);
        if (localItem?.status !== 'action_required') byId.set(item.key, item);
      }
      setTransactions(
        Array.from(byId.values()).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        ),
      );
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Wallet data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [loadOrGenerateWallet, solanaKeypair, sparkWallet, walletReady]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
    setRefreshing(false);
  }

  const totalEur =
    rates.btcToEur > 0
      ? (balances.spark / 1e8) * rates.btcToEur +
        balances.sol * rates.solToEur +
        balances.usdc
      : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#ffb000" />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Portfolio</Text>
          <Text style={styles.total}>{totalEur === null ? 'Unavailable' : 'EUR ' + totalEur.toFixed(2)}</Text>
        </View>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 42, height: 42 }} />
      </View>

      {!appConfig.isMainnet && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Development networks - real mainnet payments are blocked</Text>
        </View>
      )}

      <View style={styles.balanceRow}>
        <BalanceCard label="Lightning" value={balances.spark.toLocaleString() + ' SAT'} color="#ffb000" />
        <BalanceCard label="Solana" value={balances.sol.toFixed(4) + ' SOL'} color="#8f7de8" />
        <BalanceCard label="USDC" value={balances.usdc.toFixed(2) + ' USDC'} color="#4e8cff" />
      </View>

      <Text style={styles.sectionTitle}>Activity</Text>
      {loading && transactions.length === 0 ? (
        <ActivityIndicator color="#ffb000" />
      ) : transactions.length === 0 ? (
        <Text style={styles.empty}>No transactions yet.</Text>
      ) : (
        transactions.map(transaction => (
          <View key={transaction.key} style={styles.transaction}>
            <View style={[styles.assetDot, { backgroundColor: assetColor(transaction.asset) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.transactionTitle}>
                {transaction.type === 'incoming' ? 'Received' : 'Sent'} {transaction.asset}
              </Text>
              <Text style={styles.transactionMeta}>
                {new Date(transaction.timestamp).toLocaleString()} - {transaction.status}
              </Text>
            </View>
            <Text style={[styles.transactionAmount, transaction.type === 'incoming' && styles.incoming]}>
              {transaction.type === 'incoming' ? '+' : '-'}{transaction.amount.toLocaleString()}
            </Text>
          </View>
        ))
      )}
      {loadError && <Text style={styles.error}>{loadError}</Text>}
    </ScrollView>
  );
}

function BalanceCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.balanceCard}>
      <View style={[styles.assetDot, { backgroundColor: color }]} />
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={styles.balanceValue}>{value}</Text>
    </View>
  );
}

function assetColor(asset: string) {
  if (asset === 'SOL') return '#8f7de8';
  if (asset === 'USDC') return '#4e8cff';
  return '#ffb000';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c' },
  content: { paddingHorizontal: 16, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#8f8f9d', textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700' },
  total: { color: '#fff', fontSize: 38, fontWeight: '800', marginTop: 6 },
  banner: {
    borderColor: 'rgba(107,92,195,0.5)',
    borderWidth: 1,
    backgroundColor: 'rgba(107,92,195,0.12)',
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
  },
  bannerText: { color: '#c9c0ff', textAlign: 'center', fontSize: 13 },
  balanceRow: { gap: 10, marginTop: 22 },
  balanceCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  assetDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  balanceLabel: { color: '#a0a0ab', flex: 1 },
  balanceValue: { color: '#fff', fontWeight: '800' },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 32, marginBottom: 14 },
  transaction: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.07)',
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  transactionTitle: { color: '#fff', fontWeight: '700' },
  transactionMeta: { color: '#777783', fontSize: 12, marginTop: 4 },
  transactionAmount: { color: '#fff', fontWeight: '800' },
  incoming: { color: '#49d17d' },
  empty: { color: '#777783', textAlign: 'center', marginTop: 18 },
  error: { color: '#ff6666', textAlign: 'center', marginTop: 20 },
});
