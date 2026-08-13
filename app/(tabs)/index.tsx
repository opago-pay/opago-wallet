import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { getTransactions, Transaction as LocalTransaction } from '@/lib/database';
import { loadHederaHistory, loadHederaTransactionStatus } from '@/lib/hedera/account';
import {
  getHederaTransactionExplorerUrl,
  openHederaExplorerUrl,
} from '@/lib/hedera/explorer';
import { normalizeHederaTransactionIdForMirror } from '@/lib/hedera/mirror';
import { hederaPaymentJournal } from '@/lib/hedera/payment-journal-native';
import { formatTinybars } from '@/lib/hedera/payments';
import { getSolanaBalances, getSolanaHistory } from '@/lib/solana';
import { appConfig } from '@/lib/config';
import { withTimeout } from '@/lib/promise-timeout';

const OPTIONAL_ASSET_REFRESH_TIMEOUT_MS = 8_000;

interface DisplayTransaction {
  key: string;
  type: 'incoming' | 'outgoing';
  amountDisplay: string;
  asset: string;
  status: string;
  timestamp: string;
  txId: string | null;
  explorerUrl?: string;
}

export default function HomeScreen() {
  const {
    walletReady,
    sparkWallet,
    solanaKeypair,
    hederaAccount,
    loadOrGenerateWallet,
    refreshHederaAccount,
  } = useWalletAuth();
  const rates = useExchangeRates();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState({
    spark: 0,
    sol: 0,
    usdc: 0,
    hbarTinybars: 0n,
  });
  const [transactions, setTransactions] = useState<DisplayTransaction[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refreshAfterInitializationRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!walletReady) {
      refreshAfterInitializationRef.current = true;
      await loadOrGenerateWallet();
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const local = await getTransactions();
      const remote: DisplayTransaction[] = [];
      const remoteErrors: string[] = [];

      const journalRecords = await hederaPaymentJournal.reconcile(
        loadHederaTransactionStatus,
      );
      remote.push(...journalRecords.map(item => ({
        key: 'hedera:' + normalizeHederaTransactionIdForMirror(item.transactionId),
        txId: item.transactionId,
        type: 'outgoing' as const,
        amountDisplay: formatTinybars(BigInt(item.amountTinybars)),
        asset: 'HBAR',
        status: item.state,
        timestamp: item.createdAt,
        explorerUrl: getHederaTransactionExplorerUrl(item.transactionId),
      })));

      try {
        const account = await refreshHederaAccount();
        setBalances(current => ({
          ...current,
          hbarTinybars: account?.balanceTinybars || 0n,
        }));
        if (account) {
          const history = await loadHederaHistory(account.accountId, 20);
          remote.push(...history.map(item => ({
            key: 'hedera:' + normalizeHederaTransactionIdForMirror(item.transactionId),
            txId: item.transactionId,
            type: item.direction === 'received' ? 'incoming' as const : 'outgoing' as const,
            amountDisplay: item.amountHbar,
            asset: 'HBAR',
            status: item.result.toLowerCase(),
            timestamp: item.occurredAt,
            explorerUrl: item.hashscanUrl,
          })));
        }
      } catch (cause) {
        remoteErrors.push(
          'Hedera: ' +
            (cause instanceof Error ? cause.message : 'Testnet data could not be loaded.'),
        );
      }

      const refreshLightning = async () => {
        if (!sparkWallet) return;
        try {
          const [balance, transferResult] = await withTimeout(
            Promise.all([
              sparkWallet.getBalance(),
              sparkWallet.getTransfers(20, 0),
            ]),
            OPTIONAL_ASSET_REFRESH_TIMEOUT_MS,
            'Lightning wallet refresh timed out.',
          );
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
              amountDisplay: amount.toLocaleString(),
              asset: 'SAT',
              status: 'confirmed',
              timestamp: transfer.createdTime
                ? new Date(transfer.createdTime).toISOString()
                : new Date().toISOString(),
            });
          }
        } catch (cause) {
          remoteErrors.push(
            'Lightning: ' +
              (cause instanceof Error ? cause.message : 'Wallet data could not be loaded.'),
          );
        }
      };

      const refreshSolana = async () => {
        if (!solanaKeypair) return;
        try {
          const [solanaBalances, history] = await withTimeout(
            Promise.all([
              getSolanaBalances(solanaKeypair.publicKey),
              getSolanaHistory(solanaKeypair.publicKey),
            ]),
            OPTIONAL_ASSET_REFRESH_TIMEOUT_MS,
            'Solana wallet refresh timed out.',
          );
          setBalances(current => ({ ...current, ...solanaBalances }));
          remote.push(...history.map(item => ({
            key: item.txId,
            txId: item.txId,
            type: item.type,
            amountDisplay: item.amount.toLocaleString(),
            asset: item.asset,
            status: item.status,
            timestamp: item.timestamp,
          })));
        } catch (cause) {
          remoteErrors.push(
            'Solana: ' +
              (cause instanceof Error ? cause.message : 'Wallet data could not be loaded.'),
          );
        }
      };

      await Promise.all([refreshLightning(), refreshSolana()]);

      const localDisplay = local.map((item: LocalTransaction): DisplayTransaction => ({
        key: item.txId || 'local:' + item.id,
        txId: item.txId,
        type: item.type,
        amountDisplay: item.amount.toLocaleString(),
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
      setLoadError(remoteErrors.length ? remoteErrors.join(' ') : null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Wallet data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [
    loadOrGenerateWallet,
    refreshHederaAccount,
    solanaKeypair,
    sparkWallet,
    walletReady,
  ]);

  useEffect(() => {
    if (!walletReady || !refreshAfterInitializationRef.current) return;
    refreshAfterInitializationRef.current = false;
    void refresh();
  }, [refresh, walletReady]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Refresh must remain available if haptics are unavailable on a device.
      }
      await refresh();
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Wallet data could not be loaded.');
    } finally {
      setRefreshing(false);
    }
  }

  async function copyHederaAccountId() {
    if (!hederaAccount) return;
    await Clipboard.setStringAsync(hederaAccount.accountId);
    Alert.alert('Copied', 'Hedera testnet account ID copied.');
  }

  async function openTransaction(transaction: DisplayTransaction) {
    if (!transaction.explorerUrl) return;
    try {
      await openHederaExplorerUrl(transaction.explorerUrl);
    } catch (cause) {
      Alert.alert(
        'Could not open HashScan',
        cause instanceof Error ? cause.message : 'The explorer link is invalid.',
      );
    }
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
          <Text style={styles.valuationNote}>HBAR testnet is excluded from the EUR total.</Text>
        </View>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 42, height: 42 }} />
      </View>

      {!appConfig.isMainnet && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Development networks - real mainnet payments are blocked</Text>
        </View>
      )}

      <View style={styles.testnetBanner}>
        <Text style={styles.testnetTitle}>HEDERA TESTNET</Text>
        <Text style={styles.testnetText}>Test HBAR has no real-world value.</Text>
      </View>

      <View style={styles.balanceRow}>
        <BalanceCard label="Lightning" value={balances.spark.toLocaleString() + ' SAT'} color="#ffb000" />
        <BalanceCard label="Solana" value={balances.sol.toFixed(4) + ' SOL'} color="#8f7de8" />
        <BalanceCard label="USDC" value={balances.usdc.toFixed(2) + ' USDC'} color="#4e8cff" />
        <BalanceCard
          label="Hedera testnet"
          value={formatTinybars(balances.hbarTinybars) + ' HBAR'}
          subtitle={
            hederaAccount
              ? hederaAccount.accountId + ' - tap to copy'
              : !walletReady
                ? 'Initializing wallet...'
                : loading
                  ? 'Loading testnet account...'
                  : 'Account not provisioned'
          }
          color="#27d3b2"
          onPress={hederaAccount ? () => void copyHederaAccountId() : undefined}
        />
      </View>

      <Text style={styles.sectionTitle}>Activity</Text>
      {loading && transactions.length === 0 ? (
        <ActivityIndicator color="#ffb000" />
      ) : transactions.length === 0 ? (
        <Text style={styles.empty}>No transactions yet.</Text>
      ) : (
        transactions.map(transaction => (
          <TouchableOpacity
            key={transaction.key}
            style={styles.transaction}
            onPress={() => void openTransaction(transaction)}
            disabled={!transaction.explorerUrl}
          >
            <View style={[styles.assetDot, { backgroundColor: assetColor(transaction.asset) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.transactionTitle}>
                {transaction.type === 'incoming' ? 'Received' : 'Sent'} {transaction.asset}
              </Text>
              <Text style={styles.transactionMeta}>
                {new Date(transaction.timestamp).toLocaleString()} - {transaction.status}
                {transaction.explorerUrl ? ' - HashScan' : ''}
              </Text>
            </View>
            <Text style={[styles.transactionAmount, transaction.type === 'incoming' && styles.incoming]}>
              {transaction.type === 'incoming' ? '+' : '-'}{transaction.amountDisplay}
            </Text>
          </TouchableOpacity>
        ))
      )}
      {loadError && <Text style={styles.error}>{loadError}</Text>}
    </ScrollView>
  );
}

function BalanceCard(props: {
  label: string;
  value: string;
  subtitle?: string;
  color: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.balanceCard}
      onPress={props.onPress}
      disabled={!props.onPress}
    >
      <View style={[styles.assetDot, { backgroundColor: props.color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.balanceLabel}>{props.label}</Text>
        {props.subtitle && <Text style={styles.balanceSubtitle}>{props.subtitle}</Text>}
      </View>
      <Text style={styles.balanceValue}>{props.value}</Text>
    </TouchableOpacity>
  );
}

function assetColor(asset: string) {
  if (asset === 'SOL') return '#8f7de8';
  if (asset === 'USDC') return '#4e8cff';
  if (asset === 'HBAR') return '#27d3b2';
  return '#ffb000';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c' },
  content: { paddingHorizontal: 16, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#8f8f9d', textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700' },
  total: { color: '#fff', fontSize: 38, fontWeight: '800', marginTop: 6 },
  valuationNote: { color: '#777783', fontSize: 11, marginTop: 4 },
  banner: {
    borderColor: 'rgba(107,92,195,0.5)',
    borderWidth: 1,
    backgroundColor: 'rgba(107,92,195,0.12)',
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
  },
  bannerText: { color: '#c9c0ff', textAlign: 'center', fontSize: 13 },
  testnetBanner: {
    borderColor: '#ffb000',
    borderWidth: 2,
    backgroundColor: 'rgba(255,176,0,0.13)',
    borderRadius: 12,
    padding: 13,
    marginTop: 12,
    alignItems: 'center',
  },
  testnetTitle: { color: '#ffb000', fontWeight: '900', letterSpacing: 2, fontSize: 17 },
  testnetText: { color: '#ffe2a3', marginTop: 3, fontSize: 12 },
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
  balanceLabel: { color: '#a0a0ab' },
  balanceSubtitle: { color: '#666673', fontSize: 11, marginTop: 3 },
  balanceValue: { color: '#fff', fontWeight: '800', marginLeft: 8 },
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
