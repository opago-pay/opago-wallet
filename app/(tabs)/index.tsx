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
import { Ionicons } from '@expo/vector-icons';
import { AssetIcon } from '@/components/ui/asset-icon';
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
import {
  getWalletAssetPresentation,
  walletAssetKeyFromSymbol,
  type WalletAssetKey,
} from '@/lib/wallet-assets';

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
          <Text style={styles.eyebrow}>PORTFOLIO</Text>
          <Text style={styles.headerTitle}>Your assets</Text>
        </View>
        <View style={styles.brandMark}>
          <Image source={require('@/assets/images/logo_new.svg')} style={styles.logo} />
        </View>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total value</Text>
        <Text style={styles.total}>{totalEur === null ? 'Unavailable' : 'EUR ' + totalEur.toFixed(2)}</Text>
        <Text style={styles.valuationNote}>HBAR testnet is excluded from the EUR total.</Text>
      </View>

      {!appConfig.isMainnet && (
        <View style={styles.banner} accessibilityRole="summary">
          <Ionicons name="shield-checkmark-outline" size={19} color="#c9c0ff" />
          <Text style={styles.bannerText}>Development networks - real mainnet payments are blocked</Text>
        </View>
      )}

      <View style={styles.testnetBanner}>
        <AssetIcon asset="hedera" size={36} />
        <View style={styles.testnetCopy}>
          <View style={styles.testnetTitleRow}>
            <Text style={styles.testnetTitle}>Hedera</Text>
            <NetworkBadge label="TESTNET" />
          </View>
          <Text style={styles.testnetText}>Test HBAR has no real-world value.</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Assets</Text>
        <Text style={styles.sectionMeta}>4 assets</Text>
      </View>

      <View style={styles.assetList}>
        <BalanceCard asset="lightning" value={balances.spark.toLocaleString() + ' SAT'} />
        <BalanceCard asset="solana" value={balances.sol.toFixed(4) + ' SOL'} />
        <BalanceCard asset="usdc" value={balances.usdc.toFixed(2) + ' USDC'} />
        <BalanceCard
          asset="hedera"
          value={formatTinybars(balances.hbarTinybars) + ' HBAR'}
          subtitle={
            hederaAccount
              ? hederaAccount.accountId + ' · tap to copy'
              : !walletReady
                ? 'Initializing wallet...'
                : loading
                  ? 'Loading testnet account...'
                  : 'Account not provisioned'
          }
          onPress={hederaAccount ? () => void copyHederaAccountId() : undefined}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Activity</Text>
        {transactions.length > 0 && <Text style={styles.sectionMeta}>{transactions.length} latest</Text>}
      </View>
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
            accessibilityRole={transaction.explorerUrl ? 'link' : 'summary'}
            accessibilityLabel={`${transaction.type === 'incoming' ? 'Received' : 'Sent'} ${transaction.amountDisplay} ${transaction.asset}, ${transaction.status}`}
          >
            <AssetIcon asset={walletAssetKeyFromSymbol(transaction.asset)} size={38} />
            <View style={styles.transactionBody}>
              <Text style={styles.transactionTitle}>
                {transaction.type === 'incoming' ? 'Received' : 'Sent'} {transaction.asset}
              </Text>
              <Text style={styles.transactionMeta}>
                {new Date(transaction.timestamp).toLocaleString()} · {transaction.status}
                {transaction.explorerUrl ? ' · HashScan' : ''}
              </Text>
            </View>
            <Text style={[styles.transactionAmount, transaction.type === 'incoming' && styles.incoming]}>
              {transaction.type === 'incoming' ? '+' : '-'}{transaction.amountDisplay} {transaction.asset}
            </Text>
          </TouchableOpacity>
        ))
      )}
      {loadError && <Text style={styles.error}>{loadError}</Text>}
    </ScrollView>
  );
}

function BalanceCard(props: {
  asset: WalletAssetKey;
  value: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  const presentation = getWalletAssetPresentation(props.asset, appConfig.isMainnet);

  return (
    <TouchableOpacity
      style={styles.balanceCard}
      onPress={props.onPress}
      disabled={!props.onPress}
      activeOpacity={props.onPress ? 0.72 : 1}
      accessibilityRole={props.onPress ? 'button' : 'summary'}
      accessibilityLabel={`${presentation.name}, ${props.value}, ${props.subtitle || presentation.networkLabel}${props.onPress ? ', tap to copy account ID' : ''}`}
    >
      <AssetIcon asset={props.asset} size={44} />
      <View style={styles.balanceDetails}>
        <View style={styles.balanceTitleRow}>
          <Text style={styles.balanceLabel}>{presentation.name}</Text>
          <NetworkBadge label={presentation.networkBadge} />
        </View>
        <Text style={styles.balanceSubtitle}>{props.subtitle || presentation.networkLabel}</Text>
      </View>
      <View style={styles.balanceTrailing}>
        <Text style={styles.balanceValue}>{props.value}</Text>
        {props.onPress && <Ionicons name="copy-outline" size={16} color="#8f8f9d" />}
      </View>
    </TouchableOpacity>
  );
}

function NetworkBadge({ label }: { label: string }) {
  return (
    <View style={styles.networkBadge}>
      <Text style={styles.networkBadgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c' },
  content: { paddingHorizontal: 16, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#8f8f9d', letterSpacing: 2, fontSize: 12, fontWeight: '800' },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 3 },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 32, height: 32 },
  totalCard: {
    backgroundColor: '#141418',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 17,
    marginTop: 20,
  },
  totalLabel: { color: '#8f8f9d', fontSize: 13, fontWeight: '700' },
  total: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 4 },
  valuationNote: { color: '#777783', fontSize: 11, marginTop: 4 },
  banner: {
    borderColor: 'rgba(107,92,195,0.5)',
    borderWidth: 1,
    backgroundColor: 'rgba(107,92,195,0.12)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bannerText: { color: '#c9c0ff', flexShrink: 1, fontSize: 12, fontWeight: '600' },
  testnetBanner: {
    borderColor: 'rgba(32,201,151,0.35)',
    borderWidth: 1,
    backgroundColor: 'rgba(32,201,151,0.08)',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  testnetCopy: { flex: 1 },
  testnetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  testnetTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  testnetText: { color: '#91a9a1', marginTop: 4, fontSize: 12 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  sectionMeta: { color: '#777783', fontSize: 12, fontWeight: '600' },
  assetList: { gap: 10 },
  balanceCard: {
    backgroundColor: '#121216',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceDetails: { flex: 1, minWidth: 0 },
  balanceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  balanceLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },
  balanceSubtitle: { color: '#73737f', fontSize: 11, marginTop: 4 },
  balanceTrailing: { alignItems: 'flex-end', gap: 5, maxWidth: '44%' },
  balanceValue: { color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'right' },
  networkBadge: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  networkBadgeText: { color: '#9b9ba7', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  transaction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121216',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    marginBottom: 8,
    gap: 11,
  },
  transactionBody: { flex: 1, minWidth: 0 },
  transactionTitle: { color: '#fff', fontWeight: '700' },
  transactionMeta: { color: '#777783', fontSize: 12, marginTop: 4 },
  transactionAmount: { color: '#fff', fontWeight: '800', fontSize: 12, marginLeft: 6 },
  incoming: { color: '#49d17d' },
  empty: {
    color: '#777783',
    textAlign: 'center',
    paddingVertical: 26,
    backgroundColor: '#121216',
    borderRadius: 14,
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
  },
  error: { color: '#ff6666', textAlign: 'center', marginTop: 20 },
});
