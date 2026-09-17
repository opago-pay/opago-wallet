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
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AssetIcon } from '@/components/ui/asset-icon';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { getTransactions, Transaction as LocalTransaction } from '@/lib/database';
import { loadHederaHistory, loadHederaTransactionStatus } from '@/lib/hedera/account';
import {
  getHederaTransactionExplorerUrl,
} from '@/lib/hedera/explorer';
import { openHederaExplorerUrl } from '@/lib/hedera/explorer-native';
import { normalizeHederaTransactionIdForMirror } from '@/lib/hedera/mirror';
import { hederaPaymentJournal } from '@/lib/hedera/payment-journal-native';
import { lightningPaymentJournal } from '@/lib/lightning/payment-journal-native';
import { reconcileLightningPayments } from '@/lib/lightning/reconcile-native';
import {
  loadSparkTransfersPaginated,
  sparkUserRequestPaymentHash,
  type SparkTransferLike,
} from '@/lib/lightning/spark-history';
import { formatTinybars } from '@/lib/hedera/payments';
import { appConfig } from '@/lib/config';
import { calculatePortfolioEur } from '@/lib/portfolio-valuation';
import { withTimeout } from '@/lib/promise-timeout';
import { operationalHealth } from '@/lib/operational-health-native';
import {
  getWalletAssetPresentation,
  walletAssetKeyFromSymbol,
  type WalletAssetKey,
} from '@/lib/wallet-assets';
import {
  compactWalletIdentifier,
  formatEurValue,
  friendlyPaymentStatus,
} from '@/lib/wallet-display';

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
  explorerLabel?: 'HashScan';
}

interface SparkBalanceResult {
  balance?: unknown;
  satsBalance?: { incoming?: unknown };
}

export default function HomeScreen() {
  const router = useRouter();
  const {
    walletReady,
    sparkWallet,
    hederaAccount,
    loadOrGenerateWallet,
    refreshHederaAccount,
  } = useWalletAuth();
  const rates = useExchangeRates();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState({
    spark: 0,
    hbarTinybars: 0n,
  });
  const [transactions, setTransactions] = useState<DisplayTransaction[]>([]);
  const [activityDisplayLimit, setActivityDisplayLimit] = useState(20);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refreshAfterInitializationRef = useRef(false);
  const refreshInProgressRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!walletReady) {
      refreshAfterInitializationRef.current = true;
      try {
        await loadOrGenerateWallet();
      } catch (cause) {
        setLoadError(cause instanceof Error ? cause.message : 'Wallet initialization failed.');
      }
      return;
    }
    if (refreshInProgressRef.current) return;
    refreshInProgressRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      const local = await getTransactions();
      const remote: DisplayTransaction[] = [];
      const remoteErrors: string[] = [];

      try {
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
          explorerLabel: 'HashScan' as const,
        })));
      } catch (cause) {
        remoteErrors.push(
          'Hedera journal: ' +
            (cause instanceof Error ? cause.message : 'Local payment state could not be loaded.'),
        );
      }

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
            explorerLabel: 'HashScan' as const,
          })));
        }
      } catch (cause) {
        remoteErrors.push(
          'Hedera: ' +
            (cause instanceof Error
              ? cause.message
              : 'Hedera ' + appConfig.hederaNetwork + ' data could not be loaded.'),
        );
      }

      const refreshLightning = async () => {
        if (!sparkWallet) return;
        const lightningHistory = loadSparkTransfersPaginated(sparkWallet, 500, 50);
        const [balanceResult, transferResult, journalResult] = await Promise.allSettled([
          withTimeout(
            sparkWallet.getBalance() as Promise<SparkBalanceResult>,
            OPTIONAL_ASSET_REFRESH_TIMEOUT_MS,
            'Lightning balance refresh timed out.',
          ),
          withTimeout(
            lightningHistory,
            OPTIONAL_ASSET_REFRESH_TIMEOUT_MS,
            'Lightning history refresh timed out.',
          ),
          withTimeout(
            reconcileLightningPayments(sparkWallet, lightningHistory),
            OPTIONAL_ASSET_REFRESH_TIMEOUT_MS,
            'Lightning payment reconciliation timed out.',
          ),
        ]);
        if (balanceResult.status === 'fulfilled') {
          const balance = balanceResult.value;
          setBalances(current => ({
            ...current,
            spark: (Number(balance.balance) || 0) + (Number(balance.satsBalance?.incoming) || 0),
          }));
        } else {
          remoteErrors.push(
            'Lightning balance: ' +
              (balanceResult.reason instanceof Error
                ? balanceResult.reason.message
                : 'Wallet balance could not be loaded.'),
          );
        }
        if (journalResult.status === 'fulfilled') {
          for (const item of journalResult.value) {
            remote.push({
              key: 'ln:' + item.paymentHash,
              txId: 'ln:' + item.paymentHash,
              type: 'outgoing',
              amountDisplay: item.amountSats.toLocaleString(),
              asset: 'SAT',
              status: item.state,
              timestamp: item.createdAt,
            });
          }
        } else {
          try {
            const records = await lightningPaymentJournal.list();
            for (const item of records) {
              remote.push({
                key: 'ln:' + item.paymentHash,
                txId: 'ln:' + item.paymentHash,
                type: 'outgoing',
                amountDisplay: item.amountSats.toLocaleString(),
                asset: 'SAT',
                status: item.state,
                timestamp: item.createdAt,
              });
            }
          } catch {
            // The journal error below remains visible without hiding other wallet data.
          }
          remoteErrors.push(
            'Lightning payments: ' +
              (journalResult.reason instanceof Error
                ? journalResult.reason.message
                : 'Payment status could not be reconciled.'),
          );
        }
        if (transferResult.status === 'fulfilled') {
          for (const transfer of transferResult.value as SparkTransferLike[]) {
            const status = String(transfer.status || '').toUpperCase();
            if (!status.includes('COMPLETED')) continue;
            const amount = Math.abs(Number(transfer.totalValue) || 0);
            if (amount <= 0) continue;
            const paymentHash = sparkUserRequestPaymentHash(transfer.userRequest);
            const key = paymentHash
              ? 'ln:' + paymentHash
              : 'spark:' + String(transfer.id || 'unknown');
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
        } else {
          remoteErrors.push(
            'Lightning history: ' +
              (transferResult.reason instanceof Error
                ? transferResult.reason.message
                : 'Wallet history could not be loaded.'),
          );
        }

        const lightningFailures = [balanceResult, transferResult, journalResult]
          .filter(result => result.status === 'rejected') as PromiseRejectedResult[];
        try {
          if (lightningFailures.length > 0) {
            await operationalHealth.recordFailure('lightning', lightningFailures[0].reason);
          } else {
            await operationalHealth.recordSuccess('lightning');
          }
        } catch {
          // Diagnostics are best-effort and must not break wallet refresh.
        }
      };

      await refreshLightning();

      const localDisplay = local
        .filter(item => item.asset === 'SAT' || item.asset === 'HBAR')
        .map((item: LocalTransaction): DisplayTransaction => ({
          key: item.txId || 'local:' + item.id,
          txId: item.txId,
          type: item.type,
          amountDisplay: item.amount.toLocaleString(),
          asset: item.asset,
          status: item.status,
          timestamp: item.timestamp,
        }));
      setTransactions(current => {
        const byId = new Map<string, DisplayTransaction>();
        if (remoteErrors.length) {
          for (const item of current) byId.set(item.key, item);
        }
        for (const item of localDisplay) byId.set(item.key, item);
        for (const item of remote) {
          const localItem = byId.get(item.key);
          if (localItem?.status !== 'action_required') byId.set(item.key, item);
        }
        return Array.from(byId.values()).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        ).slice(0, 500);
      });
      setLoadError(remoteErrors.length ? remoteErrors.join(' ') : null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Wallet data could not be loaded.');
    } finally {
      refreshInProgressRef.current = false;
      setLoading(false);
    }
  }, [
    loadOrGenerateWallet,
    refreshHederaAccount,
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
    Alert.alert('Copied', 'Hedera ' + appConfig.hederaNetwork + ' account ID copied.');
  }

  async function openTransaction(transaction: DisplayTransaction) {
    if (!transaction.explorerUrl) return;
    try {
      await openHederaExplorerUrl(transaction.explorerUrl);
    } catch (cause) {
      Alert.alert(
        'Could not open explorer',
        cause instanceof Error ? cause.message : 'The explorer link is invalid.',
      );
    }
  }

  const totalEur = calculatePortfolioEur(
    {
      sparkSats: balances.spark,
      hbarTinybars: balances.hbarTinybars,
    },
    rates,
  );

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
          <Text style={styles.headerTitle}>Your wallet</Text>
          <Text style={styles.headerSubtitle}>Simple, secure crypto payments.</Text>
        </View>
        <View style={styles.brandMark}>
          <Image source={require('@/assets/images/logo_new.svg')} style={styles.logo} />
        </View>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Estimated balance</Text>
        <Text style={styles.total}>
          {totalEur === null ? '—' : formatEurValue(totalEur)}
        </Text>
        <Text style={styles.valuationNote}>
          {appConfig.isMainnet
            ? 'Based on current market prices.'
            : appConfig.isHederaMainnet
              ? 'Your HBAR is live. Bitcoin remains in test mode.'
              : 'Demo balance based on current market prices.'}
        </Text>
      </View>

      <View style={styles.quickActions}>
        <QuickAction
          icon="paper-plane"
          label="Send"
          onPress={() => router.push('/(tabs)/send')}
        />
        <QuickAction
          icon="qr-code-outline"
          label="Request"
          onPress={() => router.push('/(tabs)/receive')}
        />
      </View>

      {!appConfig.isMainnet && (
        <View style={styles.statusNotice} accessibilityRole="summary">
          <View style={styles.statusIcon}>
            <Ionicons name="shield-checkmark" size={18} color="#49d17d" />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>
              {appConfig.isHederaMainnet ? 'HBAR payments are live' : 'Demo mode'}
            </Text>
            <Text style={styles.statusText}>
              {appConfig.isHederaMainnet
                 ? 'Bitcoin is still in test mode.'
                : 'All assets are for testing only.'}
            </Text>
          </View>
          <Ionicons name="information-circle-outline" size={19} color="#747480" />
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your money</Text>
      </View>

      <View style={styles.assetList}>
        <BalanceCard asset="lightning" value={balances.spark.toLocaleString() + ' SAT'} />
        <BalanceCard
          asset="hedera"
          value={formatTinybars(balances.hbarTinybars) + ' HBAR'}
          identifier={hederaAccount?.accountId}
          statusText={
            !walletReady
              ? 'Setting up your wallet…'
              : loading && !hederaAccount
                ? 'Finding your HBAR account…'
                : hederaAccount
                  ? undefined
                  : 'Add HBAR to get started'
          }
          onCopy={hederaAccount ? () => void copyHederaAccountId() : undefined}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {transactions.length > activityDisplayLimit && (
          <TouchableOpacity
            onPress={() => setActivityDisplayLimit(limit => Math.min(limit + 20, 500))}
            accessibilityRole="button"
            accessibilityLabel="Load earlier payments"
          >
            <Text style={styles.sectionMeta}>Load earlier</Text>
          </TouchableOpacity>
        )}
      </View>
      {loading && transactions.length === 0 ? (
        <ActivityIndicator color="#ffb000" />
      ) : transactions.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={28} color="#5f5f6b" />
          <Text style={styles.emptyTitle}>No payments yet</Text>
          <Text style={styles.emptyText}>Payments you send or receive will appear here.</Text>
        </View>
      ) : (
        transactions.slice(0, activityDisplayLimit).map(transaction => {
          const friendlyStatus = friendlyPaymentStatus(transaction.status);
          return (
          <TouchableOpacity
            key={transaction.key}
            style={styles.transaction}
            onPress={() => void openTransaction(transaction)}
            disabled={!transaction.explorerUrl}
            accessibilityRole={transaction.explorerUrl ? 'link' : 'summary'}
            accessibilityLabel={`${transaction.type === 'incoming' ? 'Received' : 'Sent'} ${transaction.amountDisplay} ${transaction.asset}, ${friendlyStatus}`}
          >
            <AssetIcon asset={walletAssetKeyFromSymbol(transaction.asset)} size={40} />
            <View style={styles.transactionBody}>
              <Text style={styles.transactionTitle}>
                {transaction.type === 'incoming' ? 'Money received' : 'Payment sent'}
              </Text>
              <View style={styles.transactionMetaRow}>
                <Text style={styles.transactionMeta}>
                  {new Date(transaction.timestamp).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <View style={[
                  styles.statusPill,
                  friendlyStatus === 'Completed'
                    ? styles.statusPillSuccess
                    : friendlyStatus === 'Needs attention'
                      ? styles.statusPillError
                      : styles.statusPillPending,
                ]}>
                  <Text style={styles.statusPillText}>{friendlyStatus}</Text>
                </View>
              </View>
            </View>
            <View style={styles.transactionTrailing}>
              <Text style={[styles.transactionAmount, transaction.type === 'incoming' && styles.incoming]}>
                {transaction.type === 'incoming' ? '+' : '-'}{transaction.amountDisplay} {transaction.asset}
              </Text>
              {transaction.explorerUrl && <Ionicons name="chevron-forward" size={16} color="#5f5f6b" />}
            </View>
          </TouchableOpacity>
        );})
      )}
      {loadError && (
        <View style={styles.errorNotice}>
          <Ionicons name="cloud-offline-outline" size={18} color="#f2b45d" />
          <Text style={styles.error}>Some balances could not be refreshed. Pull down to try again.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function BalanceCard(props: {
  asset: WalletAssetKey;
  value: string;
  identifier?: string;
  statusText?: string;
  onCopy?: () => void;
}) {
  const presentation = getWalletAssetPresentation(
    props.asset,
    appConfig.isMainnet,
    appConfig.hederaNetwork,
  );

  return (
    <TouchableOpacity
      style={styles.balanceCard}
      onPress={props.onCopy}
      disabled={!props.onCopy}
      activeOpacity={props.onCopy ? 0.72 : 1}
      accessibilityRole={props.onCopy ? 'button' : 'summary'}
      accessibilityLabel={`${presentation.name}, ${props.value}, ${props.identifier ? compactWalletIdentifier(props.identifier) : presentation.description}${props.onCopy ? ', tap to copy address' : ''}`}
    >
      <AssetIcon asset={props.asset} size={44} />
      <View style={styles.balanceDetails}>
        <View style={styles.balanceTitleRow}>
          <Text style={styles.balanceLabel}>{presentation.name}</Text>
          <NetworkBadge label={presentation.networkBadge} />
        </View>
        <Text style={styles.balanceSubtitle} numberOfLines={1}>
          {props.statusText || (props.identifier
            ? compactWalletIdentifier(props.identifier)
            : presentation.description)}
        </Text>
      </View>
      <View style={styles.balanceTrailing}>
        <Text style={styles.balanceValue}>{props.value}</Text>
        {props.onCopy && <Ionicons name="copy-outline" size={16} color="#8f8f9d" />}
      </View>
    </TouchableOpacity>
  );
}

function QuickAction(props: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress(): void;
}) {
  return (
    <TouchableOpacity
      style={styles.quickAction}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
    >
      <View style={styles.quickActionIcon}>
        <Ionicons name={props.icon} size={22} color="#111" />
      </View>
      <Text style={styles.quickActionText}>{props.label}</Text>
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
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '800' },
  headerSubtitle: { color: '#8f8f9d', fontSize: 13, marginTop: 4 },
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
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginTop: 20,
  },
  totalLabel: { color: '#8f8f9d', fontSize: 13, fontWeight: '700' },
  total: { color: '#fff', fontSize: 38, fontWeight: '800', marginTop: 6 },
  valuationNote: { color: '#777783', fontSize: 12, marginTop: 6 },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 52,
    marginTop: 20,
  },
  quickAction: { alignItems: 'center', minWidth: 68 },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffb000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  quickActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  statusNotice: {
    backgroundColor: '#121216',
    borderRadius: 16,
    padding: 13,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(73,209,125,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: { flex: 1 },
  statusTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  statusText: { color: '#777783', fontSize: 11, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  sectionMeta: { color: '#777783', fontSize: 12, fontWeight: '600' },
  assetList: { gap: 10 },
  balanceCard: {
    backgroundColor: '#121216',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceDetails: { flex: 1, minWidth: 0 },
  balanceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  balanceLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  balanceSubtitle: { color: '#7f7f8b', fontSize: 12, marginTop: 4 },
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
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    gap: 11,
  },
  transactionBody: { flex: 1, minWidth: 0 },
  transactionTitle: { color: '#fff', fontWeight: '700' },
  transactionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  transactionMeta: { color: '#777783', fontSize: 11 },
  transactionTrailing: { alignItems: 'flex-end', gap: 7, maxWidth: '40%' },
  transactionAmount: { color: '#fff', fontWeight: '800', fontSize: 12, marginLeft: 6 },
  incoming: { color: '#49d17d' },
  statusPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  statusPillSuccess: { backgroundColor: 'rgba(73,209,125,0.12)' },
  statusPillPending: { backgroundColor: 'rgba(255,176,0,0.12)' },
  statusPillError: { backgroundColor: 'rgba(255,102,102,0.14)' },
  statusPillText: { color: '#b8b8c2', fontSize: 9, fontWeight: '700' },
  empty: {
    backgroundColor: '#121216',
    borderRadius: 16,
    paddingVertical: 26,
    alignItems: 'center',
  },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 10 },
  emptyText: { color: '#777783', fontSize: 12, marginTop: 4 },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginTop: 12,
    backgroundColor: 'rgba(242,180,93,0.08)',
    borderRadius: 12,
  },
  error: { color: '#d3a25d', flex: 1, fontSize: 12 },
});
