import { adaptColor, themeColor } from '@/lib/theme-styles';
import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useColorMode } from '@/hooks/useColorMode';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  Share,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { TextInput, TouchableOpacity } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { notifyPaymentHaptics } from '@/lib/optional-haptics';
import * as Notifications from 'expo-notifications';
import { CloseWalletScreen } from '@/components/navigation/close-wallet-screen';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { WalletQrCode } from '@/components/receive/wallet-qr-code';
import { AssetIcon } from '@/components/ui/asset-icon';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { BackupReminder, BackupStatusNotice } from '@/components/security/backup-prompt';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { appConfig } from '@/lib/config';
import { addTransaction } from '@/lib/database';
import {
  findNewConfirmedIncomingHederaTransaction,
  loadHederaHistory,
} from '@/lib/hedera/account';
import {
  buildHederaWalletQrValue,
} from '@/lib/hedera/payments';
import {
  HEDERA_NETWORK,
  HEDERA_NETWORK_BADGE,
} from '@/lib/hedera/config';
import { decodeLightningInvoice } from '@/lib/lightning';
import { resolveLightningReceiveOutcome, type LightningReceiveState } from '@/lib/lightning/receive-status';
import { withTimeout } from '@/lib/promise-timeout';
import { lightningReceiveStore } from '@/lib/lightning/receive-store-native';
import { openHederaExplorerUrl } from '@/lib/hedera/explorer-native';
import { sendStyles as styles } from '@/styles/send-styles';
import { exponentialBackoffDelay } from '@/lib/retry';
import { HederaActivation } from '@/components/receive/hedera-activation';
import { BitcoinDepositScreen } from '@/components/bitcoin/deposit-screen';
import { BitcoinConnectionStatus } from '@/components/bitcoin/connection-status';
import { BitcoinButton, bitcoinStyles } from '@/components/bitcoin/payment-ui';
import { bitcoinScope } from '@/lib/bitcoin/onchain';
import { archiveBitcoinRequest } from '@/lib/bitcoin/receive-archive';
import { walletSession } from '@/lib/wallet-session';
import { parsePaymentAmount } from '@/lib/payment-input';
import { friendlyPaymentMessage } from '@/lib/payment-errors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { validateBitcoinAddress } from '@/lib/bitcoin/destination';
import { satsToBtc } from '@/lib/bitcoin/amount';
import { bitcoinDepositWatch, bitcoinStaticAddressCache } from '@/lib/bitcoin/store-native';
import { beginPerformanceSpan, markNavigationReady, measurePerformance, recordPerformanceDuration } from '@/lib/performance-trace';

type ReceiveNetwork = 'lightning' | 'onchain' | 'hedera';
// Polling and amount edits rerender Receive frequently; QR encoding is only
// necessary when its actual value or physical size changes.
const StableQRCode = WalletQrCode;

function receiveAmountError(cause: unknown, rateLoading: boolean): string {
  const message = cause instanceof Error ? cause.message : 'Enter a valid amount.';
  return t(message === 'The EUR exchange rate is unavailable.'
    ? rateLoading ? 'Loading exchange rates…' : 'The exchange rate is unavailable or outdated. You can enter an amount in SAT.'
    : message);
}

export default function ReceiveScreen() {
  useLanguage();
  useColorMode();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const isFocused = useIsFocused();
  const rates = useExchangeRates();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    sparkWallet,
    sparkStatus,
    sparkError,
    retrySparkConnection,
    walletReady,
    loadOrGenerateWallet,
    hederaAccount,
    hederaPublicKey,
    refreshHederaAccount,
    backupStatus,
    beginBackup,
  } = useWalletAuth();
  const [network, setNetwork] = useState<ReceiveNetwork>('lightning');
  const [networkPickerOpen, setNetworkPickerOpen] = useState(false);
  const [amountEditorOpen, setAmountEditorOpen] = useState(false);
  const receiveScrollRef = useRef<ScrollView>(null);
  const [showAllCoins, setShowAllCoins] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [invoiceOwnerKey, setInvoiceOwnerKey] = useState<string | null>(null);
  const [invoiceRequestId, setInvoiceRequestId] = useState<string | null>(null);
  const [invoicePaymentHash, setInvoicePaymentHash] = useState<string | null>(null);
  const [invoiceAmountSats, setInvoiceAmountSats] = useState(0);
  const [invoiceExpiresAt, setInvoiceExpiresAt] = useState<number | null>(null);
  const [invoiceExpired, setInvoiceExpired] = useState(false);
  const [restoredOwnerKey, setRestoredOwnerKey] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [onchainAddress, setOnchainAddress] = useState<{ ownerKey: string; address: string } | null>(null);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [onchainLoading, setOnchainLoading] = useState(false);
  const [showDepositDetails, setShowDepositDetails] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [receiveStatus, setReceiveStatus] = useState<LightningReceiveState | 'checking' | 'offline'>('checking');
  const [amountInput, setAmountInput] = useState('');
  const [isEur, setIsEur] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const paymentDetectedAt = useRef<number | null>(null);
  const [paidNetwork, setPaidNetwork] = useState<'lightning' | 'hedera' | null>(null);
  const [receivedDescription, setReceivedDescription] = useState('');
  const [receivedExplorerUrl, setReceivedExplorerUrl] = useState<string | null>(null);
  const hederaKnownTransactions = useRef<Set<string> | null>(null);
  const [hederaReady, setHederaReady] = useState(false);
  const [hederaReadyOwnerKey, setHederaReadyOwnerKey] = useState<string | null>(null);
  const [hederaLookupError, setHederaLookupError] = useState<string | null>(null);
  const [hederaMissing, setHederaMissing] = useState(false);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const pollingEnabled = isFocused && appIsActive;
  useEffect(() => {
    if (backupStatus !== 'loading' && backupStatus !== 'verified' && backupStatus !== 'deferred') markNavigationReady('receive');
  }, [backupStatus]);
  const ownerKey = walletReady && hederaPublicKey ? `${appConfig.sparkNetwork}:${hederaPublicKey}` : null;
  const restoreComplete = !!ownerKey && restoredOwnerKey === ownerKey;
  const activeOwnerKey = useRef(ownerKey);
  activeOwnerKey.current = ownerKey;
  const restoredLightningRequest = useRef<string | null>(null);
  const receiveGeneration = useRef(0);
  const creatingInvoice = useRef<{ ownerKey: string; generation: number } | null>(null);
  const lastInvoiceAttempt = useRef<string | null>(null);
  const switchStartedAt = useRef<number | null>(null);
  const onQrReady = useCallback(() => {
    markNavigationReady('receive');
    recordPerformanceDuration('receive.qr_visible', 0);
    if (switchStartedAt.current !== null) {
      recordPerformanceDuration('receive.switch_to_qr', performance.now() - switchStartedAt.current);
      switchStartedAt.current = null;
    }
  }, []);

  useEffect(() => () => { receiveGeneration.current += 1; }, [sparkWallet, ownerKey]);

  useEffect(() => {
    hederaKnownTransactions.current = null;
    setHederaReady(false);
    setHederaReadyOwnerKey(null);
    setHederaMissing(false);
    setHederaLookupError(null);
  }, [hederaPublicKey]);

  useEffect(() => {
    if (!walletReady) void loadOrGenerateWallet().catch(() => undefined); // Provider retains the error.
  }, [loadOrGenerateWallet, walletReady]);

  useEffect(() => {
    if (!sparkWallet || !ownerKey || restoredLightningRequest.current === ownerKey) return;
    restoredLightningRequest.current = ownerKey;
    setRestoredOwnerKey(null);
    setInvoice(null);
    setInvoiceOwnerKey(null);
    setInvoiceRequestId(null);
    setInvoicePaymentHash(null);
    setInvoiceExpiresAt(null);
    setInvoiceExpired(false);
    setOnchainAddress(null);
    setOnchainError(null);
    setLoading(false);
    lastInvoiceAttempt.current = null;
    const generation = receiveGeneration.current;
    const finishRestore = beginPerformanceSpan('receive.restore');
    let cancelled = false;
    void measurePerformance('receive.restore_storage', () => lightningReceiveStore.load())
      .then(async saved => {
        if (cancelled || generation !== receiveGeneration.current) return;
        if (!saved) return;
        const scope = await bitcoinScope(sparkWallet, appConfig.sparkNetwork);
        if (saved.scope !== scope) return;
        const details = decodeLightningInvoice(saved.invoice, { allowExpired: true });
        if (details.paymentHash !== saved.paymentHash || details.amountSats !== (saved.amountSats || null)) return;
        const current = walletSession.captureRuntime();
        const assertCurrent = () => { current(); if (cancelled || generation !== receiveGeneration.current || activeOwnerKey.current !== ownerKey) throw new Error('Wallet changed.'); };
        await archiveBitcoinRequest(scope, saved, assertCurrent);
        assertCurrent();
        if (saved.expiresAt > Date.now()) {
          setInvoice(saved.invoice);
          setInvoiceOwnerKey(ownerKey);
          setAmountInput(saved.amountSats ? String(saved.amountSats) : '');
          setIsEur(false);
        }
        setInvoiceRequestId(saved.requestId);
        setInvoicePaymentHash(saved.paymentHash);
        setInvoiceAmountSats(saved.amountSats);
        setInvoiceExpiresAt(saved.expiresAt);
        setInvoiceExpired(saved.expiresAt <= Date.now());
        setReceiveStatus('checking');
        setIsPaid(false);
      })
      .catch(() => {
        finishRestore('error');
        // A storage failure must not crash the receive screen. The user can
        // still create a fresh request in the current session.
      })
      .finally(() => {
        finishRestore(cancelled ? 'cancelled' : 'ok');
        if (!cancelled && generation === receiveGeneration.current && activeOwnerKey.current === ownerKey) setRestoredOwnerKey(ownerKey);
      });
    return () => {
      cancelled = true;
    };
  }, [sparkWallet, ownerKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const markPaid = useCallback(async (
    amount: number,
    asset: 'SAT',
    txId: string,
    reference = txId,
  ) => {
    paymentDetectedAt.current = performance.now();
    recordPerformanceDuration('receive.payment_detected', 0);
    setPaidNetwork('lightning');
    setReceivedDescription(t('{amount} SAT confirmed.', { amount }));
    setIsPaid(true);
    await addTransaction('incoming', amount, asset, {
      txId,
      reference,
      status: 'confirmed',
    }).catch(() => undefined); // History can be rebuilt; proof remains authoritative.
    await lightningReceiveStore.clear(reference).catch(() => undefined);
    try {
      await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics are optional and cannot invalidate a confirmed payment.
    }
    try {
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.granted) {
        await Notifications.scheduleNotificationAsync({
          content: { title: t('Payment received') },
          trigger: null,
        });
      }
    } catch {
      // Notification availability cannot invalidate a confirmed payment.
    }
  }, []);

  useEffect(() => {
    if (!pollingEnabled || !invoice || !invoicePaymentHash || !sparkWallet || !ownerKey ||
        invoiceOwnerKey !== ownerKey || !walletReady || isPaid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;
    const generation = receiveGeneration.current;
    const isCurrent = () => !cancelled && generation === receiveGeneration.current && activeOwnerKey.current === ownerKey;

    function scheduleNextPoll(delayMs: number) {
      if (!isCurrent()) return;
      timer = setTimeout(() => void poll(), delayMs);
    }

    async function poll() {
      try {
        const outcome = await measurePerformance('receive.status', () => resolveLightningReceiveOutcome(sparkWallet!, {
          requestId: invoiceRequestId!, paymentHash: invoicePaymentHash!, amountSats: invoiceAmountSats,
        }));
        if (!isCurrent()) return;
        setReceiveStatus(outcome.state);
        if (outcome.state === 'confirmed' && outcome.amountSats) {
          await markPaid(
            outcome.amountSats,
            'SAT',
            'ln:' + invoicePaymentHash!.toLowerCase(),
            invoiceRequestId!,
          );
          return;
        }
        consecutiveFailures = 0;
      } catch {
        if (!isCurrent()) return;
        setReceiveStatus('offline');
        consecutiveFailures += 1;
      }
      scheduleNextPoll(exponentialBackoffDelay(2_500, consecutiveFailures, 30_000));
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [invoice, invoiceAmountSats, invoiceExpired, invoicePaymentHash, invoiceRequestId, invoiceOwnerKey,
    isPaid, markPaid, ownerKey, pollingEnabled, sparkWallet, walletReady]);

  useEffect(() => {
    if (!pollingEnabled || network !== 'hedera' || !walletReady || isPaid) return;
    const requestOwnerKey = ownerKey;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;

    function scheduleNextPoll(delayMs: number) {
      if (cancelled || activeOwnerKey.current !== requestOwnerKey) return;
      timer = setTimeout(runPoll, delayMs);
    }

    function runPoll() {
      void initializeAndPoll().catch(cause => {
        if (cancelled || activeOwnerKey.current !== requestOwnerKey) return;
        setHederaLookupError(cause instanceof Error ? cause.message : t('Account lookup unavailable.'));
        setHederaMissing(false);
        consecutiveFailures += 1;
        scheduleNextPoll(exponentialBackoffDelay(8_000, consecutiveFailures));
      });
    }

    async function initializeAndPoll() {
      const account = await refreshHederaAccount();
      if (cancelled || activeOwnerKey.current !== requestOwnerKey) return;
      setHederaLookupError(null);
      setHederaMissing(!account);
      if (!account) {
        setHederaReady(false);
        consecutiveFailures = 0;
        scheduleNextPoll(8_000);
        return;
      }
      const history = await loadHederaHistory(account.accountId, 10);
      if (cancelled || activeOwnerKey.current !== requestOwnerKey) return;
      if (hederaKnownTransactions.current === null) {
        hederaKnownTransactions.current = new Set(
          history.map(item => item.transactionId),
        );
        if (!cancelled && activeOwnerKey.current === requestOwnerKey) {
          setHederaReady(true);
          setHederaReadyOwnerKey(requestOwnerKey);
        }
      } else {
        const incoming = findNewConfirmedIncomingHederaTransaction(
          history,
          hederaKnownTransactions.current,
          null,
        );
        for (const item of history) {
          hederaKnownTransactions.current.add(item.transactionId);
        }
        if (incoming && !cancelled && activeOwnerKey.current === requestOwnerKey) {
          paymentDetectedAt.current = performance.now();
          recordPerformanceDuration('receive.payment_detected', 0);
          const description = t('{amount} HBAR confirmed on {network}.', { amount: incoming.amountHbar, network: HEDERA_NETWORK });
          setReceivedDescription(description);
          setReceivedExplorerUrl(incoming.hashscanUrl);
          setPaidNetwork('hedera');
          setIsPaid(true);
          await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Success);
          try {
            const permissions = await Notifications.getPermissionsAsync();
            if (permissions.granted) {
              await Notifications.scheduleNotificationAsync({
                content: { title: t('Payment received') },
                trigger: null,
              });
            }
          } catch {
            // Notification availability must not change a confirmed payment state.
          }
          return;
        }
      }
      consecutiveFailures = 0;
      scheduleNextPoll(8_000);
    }

    runPoll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hederaPublicKey, isPaid, network, ownerKey, pollingEnabled, refreshHederaAccount, walletReady]);

  const parseInvoiceAmount = useCallback((): number => {
    const freshRate = rates.updatedAt > 0 && Date.now() - rates.updatedAt <= 300_000 ? rates.btcToEur : 0;
    return parsePaymentAmount(amountInput, isEur ? 'EUR' : 'SAT', freshRate);
  }, [amountInput, isEur, rates.btcToEur, rates.updatedAt]);

  const generateInvoice = useCallback(async (amountSats: number) => {
    if (!sparkWallet || !ownerKey) return;
    const generation = receiveGeneration.current;
    if (creatingInvoice.current?.ownerKey === ownerKey && creatingInvoice.current.generation === generation) return;
    const task = { ownerKey, generation };
    const finishCreate = beginPerformanceSpan('receive.create_invoice');
    creatingInvoice.current = task;
    const isCurrent = () => generation === receiveGeneration.current && activeOwnerKey.current === ownerKey;
    const assertCurrent = () => { if (!isCurrent()) throw new Error('Wallet locked.'); };
    setLoading(true);
    try {
      if (!Number.isSafeInteger(amountSats) || amountSats < 0) throw new Error('Enter a valid amount.');
      const result = await measurePerformance('receive.spark_invoice', () => withTimeout<{ id: string; invoice: string | { encodedInvoice: string } }>(sparkWallet.createLightningInvoice({
        amountSats,
        memo: 'Opago',
        expirySeconds: 600,
      }), 20_000, 'Lightning request timed out.'));
      assertCurrent();
      const rawInvoice =
        typeof result.invoice === 'string' ? result.invoice : result.invoice.encodedInvoice;
      const details = decodeLightningInvoice(rawInvoice);
      if (details.amountSats !== (amountSats || null)) throw new Error('Spark returned an invoice with the wrong amount.');
      if (typeof result.id !== 'string' || !result.id) {
        throw new Error('Spark returned no request identifier.');
      }
      const encodedRequest = 'lightning:' + details.invoice;
      const saved = {
        scope: await bitcoinScope(sparkWallet, appConfig.sparkNetwork),
        requestId: result.id,
        invoice: encodedRequest,
        paymentHash: details.paymentHash,
        amountSats,
        expiresAt: details.expiresAt || Date.now() + 600_000,
        createdAt: new Date().toISOString(),
      };
      await measurePerformance('receive.invoice_persist', async () => {
        await archiveBitcoinRequest(saved.scope, saved, assertCurrent);
        await lightningReceiveStore.save(saved, assertCurrent);
      });
      assertCurrent();
      setInvoice(encodedRequest);
      setInvoiceOwnerKey(ownerKey);
      setInvoiceRequestId(result.id);
      setInvoicePaymentHash(details.paymentHash);
      setInvoiceAmountSats(amountSats);
      setInvoiceExpiresAt(details.expiresAt || Date.now() + 600_000);
      setInvoiceExpired(false);
      setReceiveStatus('checking');
      setIsPaid(false);
      setRequestError(null);
    } catch (cause) {
      finishCreate('error');
      if (!isCurrent()) return;
      setRequestError(t(friendlyPaymentMessage(cause, 'Bitcoin')));
    } finally {
      finishCreate();
      if (creatingInvoice.current === task) creatingInvoice.current = null;
      if (isCurrent()) setLoading(false);
    }
  }, [sparkWallet, ownerKey]);

  const reset = useCallback((clearLightning: boolean) => {
    if (clearLightning) {
      receiveGeneration.current += 1;
      setInvoice(null);
      setInvoiceOwnerKey(null);
      setInvoiceRequestId(null);
      setInvoicePaymentHash(null);
      setInvoiceAmountSats(0);
      setInvoiceExpiresAt(null);
      setInvoiceExpired(false);
      setReceiveStatus('checking');
    }
    setIsPaid(false);
    setPaidNetwork(null);
    setReceivedDescription('');
    setReceivedExplorerUrl(null);
    hederaKnownTransactions.current = null;
    setHederaReady(false);
    setHederaReadyOwnerKey(null);
    setHederaLookupError(null);
    setHederaMissing(false);
  }, []);

  const finishReceiving = useCallback(() => {
    const clearLightning = paidNetwork === 'lightning';
    reset(clearLightning);
    if (clearLightning) lastInvoiceAttempt.current = null;
    setNetwork('lightning');
    setNetworkPickerOpen(false);
    setAmountEditorOpen(false);
    setShowAllCoins(false);
    if (clearLightning) {
      setAmountInput('');
      setIsEur(true);
    }
  }, [paidNetwork, reset]);

  const returnHomeAfterReceive = useCallback(() => {
    finishReceiving();
    routerRef.current.replace('/(tabs)');
  }, [finishReceiving]);

  useEffect(() => {
    if (!isPaid) return;
    if (paymentDetectedAt.current !== null) {
      recordPerformanceDuration('receive.confirm_to_screen', performance.now() - paymentDetectedAt.current);
      paymentDetectedAt.current = null;
    }
    const timer = setTimeout(returnHomeAfterReceive, 3_000);
    return () => clearTimeout(timer);
  }, [isPaid, returnHomeAfterReceive]);

  useEffect(() => {
    if (!invoiceExpiresAt || isPaid) return;
    const expire = () => {
      receiveGeneration.current += 1;
      lastInvoiceAttempt.current = null;
      setInvoice(null);
      setInvoiceOwnerKey(null);
      setInvoiceExpiresAt(null);
      setInvoiceExpired(true);
    };
    const remaining = invoiceExpiresAt - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }
    const timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [invoiceExpiresAt, isPaid]);

  async function copy(value: string) {
    await Clipboard.setStringAsync(value);
    Alert.alert(t('Copied'), t('Payment information copied to your clipboard.'));
  }

  async function openReceivedTransaction() {
    if (!receivedExplorerUrl) return;
    try {
      await openHederaExplorerUrl(receivedExplorerUrl);
    } catch (cause) {
      Alert.alert(
        t('Could not open receipt'),
        t(cause instanceof Error ? cause.message : t('The explorer link is invalid.')),
      );
    }
  }

  useEffect(() => {
    if (!restoreComplete || !sparkWallet || !walletReady || !ownerKey || network !== 'lightning' || !pollingEnabled || isPaid || loading) return;
    let amountSats: number;
    try {
      amountSats = parseInvoiceAmount();
      if (amountInput.trim() && amountSats <= 0) throw new Error('Enter a positive amount.');
    } catch (cause) {
      setRequestError(receiveAmountError(cause, rates.isLoading));
      return;
    }
    if (invoice && invoiceOwnerKey === ownerKey && !invoiceExpired && receiveStatus !== 'failed' &&
        invoiceAmountSats === amountSats && (!invoiceExpiresAt || invoiceExpiresAt > Date.now())) return;
    const key = `${amountSats}:${amountInput}:${isEur}:${rates.updatedAt}`;
    if (lastInvoiceAttempt.current === key) return;
    const timer = setTimeout(() => {
      if (lastInvoiceAttempt.current === key) return;
      lastInvoiceAttempt.current = key;
      void generateInvoice(amountSats);
    }, amountInput.trim() ? 500 : 0);
    return () => clearTimeout(timer);
  }, [restoreComplete, sparkWallet, walletReady, ownerKey, network, pollingEnabled, isPaid, loading,
    amountInput, isEur, rates.updatedAt, rates.isLoading, invoice, invoiceOwnerKey, invoiceExpiresAt, invoiceExpired, invoiceAmountSats, receiveStatus,
    retryVersion, parseInvoiceAmount, generateInvoice]);

  const shouldPrefetchOnchain = network === 'onchain' ||
    (restoreComplete && !!invoice && invoiceOwnerKey === ownerKey);

  useEffect(() => {
    // Warm the wallet-bound static address while Lightning is displayed. A
    // later tab switch should only change which already prepared QR is shown.
    if (!sparkWallet || !walletReady || !ownerKey || onchainAddress?.ownerKey === ownerKey || onchainError || !pollingEnabled ||
        !shouldPrefetchOnchain) return;
    let cancelled = false;
    const assertWallet = walletSession.captureRuntime();
    const assertCurrent = () => {
      assertWallet();
      if (cancelled || activeOwnerKey.current !== ownerKey) throw new Error('Wallet changed.');
    };
    setOnchainLoading(true);
    void measurePerformance('receive.onchain_address', async () => {
      const scope = await bitcoinScope(sparkWallet, appConfig.sparkNetwork);
      assertCurrent();
      const cachedAddress = await bitcoinStaticAddressCache.load(scope, appConfig.sparkNetwork, assertCurrent);
      let address = cachedAddress;
      if (!address) {
        address = validateBitcoinAddress(
          await withTimeout(sparkWallet.getStaticDepositAddress(), 20_000, 'Bitcoin address unavailable.'),
          appConfig.sparkNetwork,
        );
      }
      assertCurrent();
      await bitcoinDepositWatch.enable(scope, assertCurrent);
      if (!cachedAddress) await bitcoinStaticAddressCache.save(scope, address, appConfig.sparkNetwork, assertCurrent);
      assertCurrent();
      setOnchainAddress({ ownerKey, address });
      setOnchainError(null);
    }).catch(cause => {
      if (!cancelled && activeOwnerKey.current === ownerKey) setOnchainError(t(friendlyPaymentMessage(cause, 'Bitcoin')));
    }).finally(() => { if (!cancelled && activeOwnerKey.current === ownerKey) setOnchainLoading(false); });
    return () => { cancelled = true; };
  }, [sparkWallet, walletReady, ownerKey, onchainAddress?.ownerKey, onchainError, pollingEnabled, shouldPrefetchOnchain]);

  if (backupStatus === 'loading') return <View style={[styles.container, styles.centered]}>
    <CloseWalletScreen style={{ position: 'absolute', top: insets.top + 12, right: 23 }} />
    <BackupStatusNotice />
  </View>;

  if (backupStatus !== 'verified' && backupStatus !== 'deferred') return (
    <View style={[styles.container, styles.centered]}>
      <CloseWalletScreen style={{ position: 'absolute', top: insets.top + 12, right: 23 }} />
      <Text style={styles.successTitle}>{t("Back up before adding money")}</Text>
      <Text style={styles.subtitle}>{t("Write down your recovery words and check your backup in Settings > Security and backup.")}</Text>
      <TouchableOpacity style={[styles.button, styles.fullWidthButton]} accessibilityRole="button" onPress={() => { beginBackup(); router.push({ pathname: '/(tabs)/settings', params: { section: 'security' } }); }}>
        <Text style={styles.buttonText}>{t("Back up my wallet")}</Text>
      </TouchableOpacity>
    </View>
  );

  if (isPaid) return (
    <View style={[styles.container, styles.centered]}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={50} color={themeColor('successText')} accessibilityLabel={t("Confirmed")} />
      </View>
      <Text style={styles.successTitle}>{t("Payment received")}</Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        {receivedDescription || t('The payment is complete and saved in your activity.')}
      </Text>
      <TouchableOpacity
        style={[styles.button, styles.fullWidthButton, { marginTop: 24 }]}
        onPress={returnHomeAfterReceive}
      >
        <Text style={styles.buttonText}>{t("Done")}</Text>
      </TouchableOpacity>
      {receivedExplorerUrl && (
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
          onPress={() => void openReceivedTransaction()}
          accessibilityRole="link"
          accessibilityLabel={t("View payment receipt")}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>{t("View receipt")}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.textButton} onPress={finishReceiving}>
        <Text style={styles.textButtonText}>{t("Request another payment")}</Text>
      </TouchableOpacity>
    </View>
  );

  if (showDepositDetails) return <BitcoinDepositScreen wallet={sparkWallet} onBack={() => setShowDepositDetails(false)} />;

  const switchNetwork = (next: ReceiveNetwork) => {
    if (next === network) return;
    switchStartedAt.current = performance.now();
    setNetwork(next);
    setNetworkPickerOpen(false);
    setAmountEditorOpen(false);
    Keyboard.dismiss();
  };
  const changeAmount = (value: string) => {
    if (value === amountInput) return;
    let newAmountSats: number | null = null;
    try {
      const freshRate = rates.updatedAt > 0 && Date.now() - rates.updatedAt <= 300_000 ? rates.btcToEur : 0;
      newAmountSats = parsePaymentAmount(value, isEur ? 'EUR' : 'SAT', freshRate);
    } catch { /* A partial amount invalidates the previous payment code. */ }
    let previousAmountSats: number | null = null;
    try { previousAmountSats = parseInvoiceAmount(); } catch { /* Partial input has no fixed amount. */ }
    const amountChanged = newAmountSats !== previousAmountSats;
    setAmountInput(value);
    setRequestError(null);
    if (amountChanged) {
      receiveGeneration.current += 1;
      lastInvoiceAttempt.current = null;
      setLoading(false);
      if (invoiceRequestId) void lightningReceiveStore.clear(invoiceRequestId).catch(() => undefined);
      setInvoice(null);
      setInvoiceOwnerKey(null);
      setInvoiceRequestId(null);
      setInvoicePaymentHash(null);
      setInvoiceExpiresAt(null);
      setInvoiceExpired(false);
      setReceiveStatus('checking');
    }
  };
  let draftSats: number | null = null;
  let draftAmountError: string | null = null;
  if (network !== 'hedera') {
    try { draftSats = parseInvoiceAmount(); } catch (cause) {
      // A partial amount never produces a QR, including on-chain amount URIs.
      draftAmountError = receiveAmountError(cause, rates.isLoading);
    }
  }
  const numericAmount = Number(amountInput.replace(',', '.'));
  const eurRateMissing = isEur && !!amountInput.trim() &&
    (rates.updatedAt <= 0 || Date.now() - rates.updatedAt > 300_000 || !(rates.btcToEur > 0));
  const amountLabel = amountInput.trim() && draftSats !== null && draftSats > 0 && Number.isFinite(numericAmount)
    ? `${numericAmount.toLocaleString(appLocale(), { minimumFractionDigits: isEur ? 2 : 0, maximumFractionDigits: isEur ? 2 : 0 })} ${isEur ? '€' : 'Sats'}`
    : null;
  const lightningReady = network === 'lightning' && !!sparkWallet && !!ownerKey && restoreComplete &&
    !!invoice && invoiceOwnerKey === ownerKey && !invoiceExpired &&
    (!invoiceExpiresAt || invoiceExpiresAt > Date.now()) &&
    receiveStatus !== 'failed' && draftSats !== null && draftSats === invoiceAmountSats;
  const onchainReady = network === 'onchain' && !!sparkWallet && !!ownerKey &&
    onchainAddress?.ownerKey === ownerKey && draftSats !== null;
  const hederaReadyForQr = network === 'hedera' && !!ownerKey && !!hederaAccount &&
    hederaReady && hederaReadyOwnerKey === ownerKey;
  const qrValue = lightningReady ? invoice! : onchainReady
    ? `bitcoin:${onchainAddress!.address}${draftSats! > 0 ? `?amount=${satsToBtc(draftSats!)}` : ''}`
    : hederaReadyForQr ? buildHederaWalletQrValue(hederaAccount.accountId) : '';
  const displayValue = network === 'hedera' ? hederaAccount?.accountId
    : network === 'onchain' && draftSats === 0 ? onchainAddress?.address : qrValue;
  // Leave 22 px of white card around the QR, in addition to its encoded quiet zone.
  const qrSize = Math.max(160, Math.min(300, width - 90));
  const receiveRoutes: { id: ReceiveNetwork; label: string; description: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { id: 'lightning', label: 'Lightning', description: 'Receive from a Lightning wallet.', icon: 'flash-outline' },
    { id: 'onchain', label: 'Bitcoin network', description: 'Receive to a Bitcoin address, for example from an exchange.', icon: 'logo-bitcoin' },
  ];
  if (showAllCoins || network === 'hedera') receiveRoutes.push({
    id: 'hedera', label: 'HBAR', description: 'Receive to your Hedera account.', icon: 'wallet-outline',
  });

  return <ScrollView
    ref={receiveScrollRef}
    style={styles.scrollContainer}
    contentContainerStyle={[styles.formContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 23 }]}
    keyboardShouldPersistTaps="handled"
  >
    <View style={styles.header}>
      <Text style={bitcoinStyles.title}>{t(network === 'hedera' ? 'Receive HBAR' : 'Receive Bitcoin')}</Text>
      <CloseWalletScreen />
    </View>
    <BackupReminder />
    {walletReady && network !== 'hedera' &&
      <BitcoinConnectionStatus status={sparkStatus} error={sparkError} onRetry={retrySparkConnection} />}

    <TouchableOpacity
      onPress={() => setNetworkPickerOpen(open => !open)}
      accessibilityRole="button"
      accessibilityLabel={t('Via {network}', { network: network === 'lightning' ? 'Lightning' : network === 'onchain' ? t('Bitcoin network') : 'HBAR' })}
      accessibilityState={{ expanded: networkPickerOpen }}
      style={{ alignSelf: 'flex-start', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 14, marginBottom: networkPickerOpen ? 6 : 16 }}
    >
      <Text style={{ color: adaptColor('#d8d8dc', 'color'), fontSize: 15, fontWeight: '600' }}>
        {t('Via {network}', { network: network === 'lightning' ? 'Lightning' : network === 'onchain' ? t('Bitcoin network') : 'HBAR' })}
      </Text>
      <Ionicons name={networkPickerOpen ? 'chevron-up' : 'chevron-down'} size={17} color={adaptColor('#a9a9b0', 'color')} />
    </TouchableOpacity>
    {networkPickerOpen && <View style={{ backgroundColor: adaptColor('#1b1b20', 'backgroundColor'), borderRadius: 18, padding: 6, marginBottom: 16 }}>
      {receiveRoutes.map(item => <TouchableOpacity
        key={item.id}
        onPress={() => { if (item.id === network) setNetworkPickerOpen(false); else switchNetwork(item.id); }}
        accessibilityRole="radio"
        accessibilityState={{ checked: network === item.id }}
        style={{ minHeight: 68, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
          backgroundColor: network === item.id ? adaptColor('#2a2924', 'backgroundColor') : 'transparent' }}
      >
        {item.id === 'hedera' ? <AssetIcon asset="hedera" size={21} /> :
          <Ionicons name={item.icon} size={21} color={network === item.id ? themeColor('accentText') : adaptColor('#c8c8ce', 'color')} />}
        <View style={{ flex: 1 }}>
          <Text style={{ color: adaptColor('#fff', 'color'), fontSize: 15, fontWeight: '700' }}>{t(item.label)}</Text>
          <Text style={{ color: adaptColor('#aaaab4', 'color'), fontSize: 12, lineHeight: 17, marginTop: 2 }}>{t(item.description)}</Text>
        </View>
        {network === item.id && <Ionicons name="checkmark" size={19} color={themeColor('accentText')} />}
      </TouchableOpacity>)}
      {!showAllCoins && network !== 'hedera' && <TouchableOpacity
        onPress={() => setShowAllCoins(true)}
        accessibilityRole="button"
        accessibilityLabel={t('Show all coins')}
        style={{ minHeight: 56, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <Ionicons name="grid-outline" size={21} color={themeColor('accentText')} />
        <Text style={{ color: themeColor('accentText'), fontSize: 15, fontWeight: '700', flex: 1 }}>{t('Show all coins')}</Text>
        <Ionicons name="chevron-down" size={17} color={themeColor('accentText')} />
      </TouchableOpacity>}
    </View>}

    {network !== 'hedera' && amountEditorOpen && <View style={{ backgroundColor: adaptColor('#1b1b20', 'backgroundColor'), borderRadius: 20, padding: 16, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <Text style={{ color: adaptColor('#fff', 'color'), fontSize: 16, fontWeight: '700', flexShrink: 1 }}>{t('Amount (optional)')}</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {(['EUR', 'SAT'] as const).map(currency => <TouchableOpacity
            key={currency}
            onPress={() => { changeAmount(''); setIsEur(currency === 'EUR'); lastInvoiceAttempt.current = null; }}
            accessibilityRole="radio"
            accessibilityLabel={currency === 'EUR' ? t('Euro') : t('Sats')}
            accessibilityState={{ checked: isEur ? currency === 'EUR' : currency === 'SAT' }}
            style={{ minHeight: 44, minWidth: 48, paddingHorizontal: 9, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: (isEur ? currency === 'EUR' : currency === 'SAT') ? adaptColor('#30302a', 'backgroundColor') : 'transparent' }}
          ><Text style={{ color: adaptColor((isEur ? currency === 'EUR' : currency === 'SAT') ? '#ffb000' : '#a9a9b1', 'color'), fontWeight: '700', fontSize: 14 }}>
            {currency === 'EUR' ? '€' : 'SAT'}
          </Text></TouchableOpacity>)}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: adaptColor('#46464c', 'borderColor'), borderRadius: 14, minHeight: 56, paddingHorizontal: 14 }}>
        <TextInput
          value={amountInput}
          onChangeText={changeAmount}
          editable={restoreComplete}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={adaptColor('#696971', 'color')}
          accessibilityLabel={t('Amount (optional)')}
          style={{ color: adaptColor('#fff', 'color'), fontSize: 26, fontWeight: '700', flex: 1, paddingVertical: 6 }}
        />
        <Text style={{ color: themeColor('accentText'), fontSize: 19, fontWeight: '700' }}>{isEur ? '€' : 'SAT'}</Text>
      </View>
      {(network === 'lightning' ? requestError : draftAmountError) && <Text style={{
        color: rates.isLoading ? adaptColor('#aaaab4', 'color') : adaptColor('#ffab97', 'color'), fontSize: 13, marginTop: 8,
      }}>{network === 'lightning' ? requestError : draftAmountError}</Text>}
    </View>}

    <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: qrSize + 44, marginBottom: 6 }} accessibilityLiveRegion="polite">
      {qrValue ? <View style={{ backgroundColor: adaptColor('#fff', 'backgroundColor'), borderRadius: 24, padding: 22, overflow: 'hidden' }}>
        <StableQRCode value={qrValue} size={qrSize} focused={isFocused} onReady={onQrReady} />
      </View> : <View style={{ width: qrSize + 44, height: qrSize + 44, borderRadius: 24, backgroundColor: adaptColor('#1b1b20', 'backgroundColor'), alignItems: 'center', justifyContent: 'center', padding: 22 }}>
        {loading || onchainLoading || (!hederaReady && network === 'hedera') || (!restoreComplete && network === 'lightning')
          ? <ActivityIndicator color={themeColor('accentText')} size="large" />
          : <Ionicons name="qr-code-outline" size={40} color={themeColor('muted')} />}
        <Text style={{ color: adaptColor('#aaaab4', 'color'), textAlign: 'center', marginTop: 12 }}>
          {(network === 'lightning' ? requestError : network === 'onchain' ? draftAmountError || onchainError : hederaLookupError) || t('Preparing payment code…')}
        </Text>
      </View>}
    </View>

    {network !== 'hedera' && !amountEditorOpen && <TouchableOpacity
      onPress={() => {
        setNetworkPickerOpen(false);
        setAmountEditorOpen(true);
        // The editor sits above the QR so a later keyboard never covers the amount.
        setTimeout(() => receiveScrollRef.current?.scrollTo({ y: 0, animated: true }), 0);
      }}
      accessibilityRole="button"
      accessibilityLabel={amountLabel ? t('Change amount') : t('Add amount')}
      style={{ alignSelf: 'center', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14, paddingHorizontal: 12 }}
    >
      <Ionicons name={amountLabel ? 'pencil-outline' : 'add'} size={19} color={themeColor('accentText')} />
      <Text style={{ color: adaptColor('#ffb000', 'color'), fontSize: 15, fontWeight: '700' }}>
        {amountLabel ? `${amountLabel} · ${t('Change')}` : t('Add amount')}
      </Text>
    </TouchableOpacity>}

    {network === 'lightning' && qrValue && <Text style={{ color: adaptColor('#aaaab4', 'color'), textAlign: 'center', fontSize: 13, marginBottom: 12 }}>
      {t(receiveStatus === 'offline' ? 'Connection interrupted. Your request is saved; checking again automatically.' :
        receiveStatus === 'processing' ? 'Payment is processing. Waiting for confirmation.' : 'Show this code to receive Bitcoin.')}
    </Text>}
    {network === 'onchain' && <Text style={{ color: adaptColor('#aaaab4', 'color'), textAlign: 'center', fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
      {t('Bitcoin deposits require network confirmation and a claim fee before the balance is available.')}
    </Text>}
    {network === 'hedera' && (hederaMissing && hederaPublicKey ? <HederaActivation publicKey={hederaPublicKey} network={HEDERA_NETWORK_BADGE} /> :
      <Text style={{ color: adaptColor('#aaaab4', 'color'), textAlign: 'center', fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
        {hederaLookupError ? t('Account verification unavailable:') + ' ' + t(hederaLookupError) :
          t('HashPack scans the account ID. Enter the amount in the sending wallet.')}
      </Text>)}

    {qrValue && <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 10 }}>
      <TouchableOpacity onPress={() => void copy(displayValue || qrValue)} accessibilityRole="button" style={{ minHeight: 48, minWidth: 120, borderRadius: 24, borderWidth: 1, borderColor: adaptColor('#44444a', 'borderColor'), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }}>
        <Ionicons name="copy-outline" size={18} color={themeColor('accentText')} /><Text style={{ color: adaptColor('#fff', 'color'), fontWeight: '700' }}>{t('Copy')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void Share.share({ message: qrValue }).catch(() => Alert.alert(t('Please try again.')))} accessibilityRole="button" style={{ minHeight: 48, minWidth: 120, borderRadius: 24, borderWidth: 1, borderColor: adaptColor('#44444a', 'borderColor'), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }}>
        <Ionicons name="share-outline" size={18} color={themeColor('accentText')} /><Text style={{ color: adaptColor('#fff', 'color'), fontWeight: '700' }}>{t('Share')}</Text>
      </TouchableOpacity>
    </View>}
    {requestError && network === 'lightning' && <BitcoinButton label={t('Try again')} secondary onPress={() => {
      lastInvoiceAttempt.current = null;
      setRequestError(null);
      setRetryVersion(value => value + 1);
      if (eurRateMissing) {
        void rates.refresh();
      }
    }} />}
    {(onchainError || (eurRateMissing && !rates.isLoading)) && network === 'onchain' && <BitcoinButton label={t('Try again')} secondary onPress={() => {
      setOnchainError(null);
      if (eurRateMissing) {
        void rates.refresh();
      }
    }} />}
    {network === 'onchain' && <BitcoinButton label={t('Incoming Bitcoin')} secondary onPress={() => setShowDepositDetails(true)} />}

  </ScrollView>;
}
