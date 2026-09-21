import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { TextInput, TouchableOpacity } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { notifyPaymentHaptics } from '@/lib/optional-haptics';
import * as Notifications from 'expo-notifications';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { AdvancedOptions } from '@/components/ui/advanced-options';
import { PaymentBackButton } from '@/components/send/payment-back-button';
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
  buildHederaReceiveRequest,
  buildHederaWalletQrValue,
  parseHederaTransferTinybars,
} from '@/lib/hedera/payments';
import {
  HEDERA_NETWORK,
  HEDERA_NETWORK_BADGE,
  HEDERA_NETWORK_LABEL,
} from '@/lib/hedera/config';
import { decodeLightningInvoice } from '@/lib/lightning';
import { sparkTransferMatchesInvoice, verifyPaymentPreimage } from '@/lib/payments';
import { lightningReceiveStore } from '@/lib/lightning/receive-store-native';
import { loadSparkTransfersPaginated } from '@/lib/lightning/spark-history';
import { openHederaExplorerUrl } from '@/lib/hedera/explorer-native';
import { sendStyles as styles } from '@/styles/send-styles';
import { getWalletAssetPresentation, type WalletAssetKey } from '@/lib/wallet-assets';
import { compactWalletIdentifier } from '@/lib/wallet-display';
import { exponentialBackoffDelay } from '@/lib/retry';
import { HederaActivation } from '@/components/receive/hedera-activation';

type ReceiveNetwork = 'lightning' | 'hedera';

export default function ReceiveScreen() {
  useLanguage();
  const router = useRouter();
  const isFocused = useIsFocused();
  const rates = useExchangeRates();
  const {
    sparkWallet,
    walletReady,
    loadOrGenerateWallet,
    hederaAccount,
    hederaPublicKey,
    refreshHederaAccount,
    backupStatus,
    beginBackup,
  } = useWalletAuth();
  const [network, setNetwork] = useState<ReceiveNetwork>('lightning');
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [networkSelected, setNetworkSelected] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [invoiceRequestId, setInvoiceRequestId] = useState<string | null>(null);
  const [invoicePaymentHash, setInvoicePaymentHash] = useState<string | null>(null);
  const [invoiceAmountSats, setInvoiceAmountSats] = useState(0);
  const [invoiceExpiresAt, setInvoiceExpiresAt] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [isEur, setIsEur] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [receivedDescription, setReceivedDescription] = useState('');
  const [receivedExplorerUrl, setReceivedExplorerUrl] = useState<string | null>(null);
  const hederaKnownTransactions = useRef<Set<string> | null>(null);
  const hederaExpectedAmountTinybars = useRef<bigint | null>(null);
  const [hederaReady, setHederaReady] = useState(false);
  const [hederaLookupError, setHederaLookupError] = useState<string | null>(null);
  const [hederaMissing, setHederaMissing] = useState(false);
  const [hederaRequest, setHederaRequest] = useState<string | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const pollingEnabled = isFocused && appIsActive;
  const restoredLightningRequest = useRef(false);

  useEffect(() => {
    hederaKnownTransactions.current = null;
    hederaExpectedAmountTinybars.current = null;
    setHederaRequest(null);
    setHederaReady(false);
    setHederaMissing(false);
    setHederaLookupError(null);
  }, [hederaPublicKey]);

  useEffect(() => {
    if (!walletReady) void loadOrGenerateWallet().catch(() => undefined); // Provider retains the error.
  }, [loadOrGenerateWallet, walletReady]);

  useEffect(() => {
    if (!sparkWallet || restoredLightningRequest.current) return;
    restoredLightningRequest.current = true;
    let cancelled = false;
    void lightningReceiveStore.load()
      .then(saved => {
        if (!saved || cancelled) return;
        setNetwork('lightning');
        setNetworkSelected(true);
        setInvoice(saved.invoice);
        setInvoiceRequestId(saved.requestId);
        setInvoicePaymentHash(saved.paymentHash);
        setInvoiceAmountSats(saved.amountSats);
        setInvoiceExpiresAt(saved.expiresAt);
        setIsPaid(false);
      })
      .catch(() => {
        // A storage failure must not crash the receive screen. The user can
        // still create a fresh request in the current session.
      });
    return () => {
      cancelled = true;
    };
  }, [sparkWallet]);

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
    await addTransaction('incoming', amount, asset, {
      txId,
      reference,
      status: 'confirmed',
    });
    await lightningReceiveStore.clear();
    setReceivedDescription(t('{amount} SAT confirmed.', { amount }));
    setIsPaid(true);
    try {
      await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics are optional and cannot invalidate a confirmed payment.
    }
    try {
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.granted) {
        await Notifications.scheduleNotificationAsync({
          content: { title: t('Payment received'), body: t('{amount} SAT confirmed.', { amount }) },
          trigger: null,
        });
      }
    } catch {
      // Notification availability cannot invalidate a confirmed payment.
    }
  }, []);

  useEffect(() => {
    if (!pollingEnabled || !invoice || !invoicePaymentHash || !sparkWallet || isPaid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;

    function scheduleNextPoll(delayMs: number) {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    }

    async function poll() {
      try {
        if (invoiceRequestId && typeof sparkWallet.getLightningReceiveRequest === 'function') {
          const request = await sparkWallet.getLightningReceiveRequest(invoiceRequestId);
          const status = String(request?.status || '').toUpperCase();
          if (status.includes('FAILED')) {
            await lightningReceiveStore.clear();
            if (!cancelled) {
              setInvoice(null);
              setInvoiceRequestId(null);
              setInvoicePaymentHash(null);
              setInvoiceAmountSats(0);
              setInvoiceExpiresAt(null);
              setIsPaid(false);
              Alert.alert(t('Request closed'), t('This Lightning request could not be completed. Create a new one.'));
            }
            return;
          }
          if (status === 'TRANSFER_COMPLETED') {
            verifyPaymentPreimage(request?.paymentPreimage, invoicePaymentHash!);
            if (!cancelled) {
              await markPaid(
                invoiceAmountSats,
                'SAT',
                'ln:' + invoicePaymentHash!.toLowerCase(),
                invoiceRequestId,
              );
            }
            return;
          }
        }

        const transfers = await loadSparkTransfersPaginated(sparkWallet, 200, 50);
        const matching = transfers.find((transfer: unknown) =>
          sparkTransferMatchesInvoice(transfer, invoicePaymentHash!, invoiceAmountSats),
        );
        if (matching && !cancelled) {
          await markPaid(
            invoiceAmountSats,
            'SAT',
            'ln:' + invoicePaymentHash!.toLowerCase(),
            'spark:' + matching.id,
          );
          return;
        }
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures += 1;
      }
      scheduleNextPoll(exponentialBackoffDelay(2_500, consecutiveFailures, 30_000));
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [invoice, invoiceAmountSats, invoicePaymentHash, invoiceRequestId, isPaid, markPaid, pollingEnabled, sparkWallet]);

  useEffect(() => {
    if (!pollingEnabled || !networkSelected || network !== 'hedera' || !walletReady || isPaid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;

    function scheduleNextPoll(delayMs: number) {
      if (cancelled) return;
      timer = setTimeout(runPoll, delayMs);
    }

    function runPoll() {
      void initializeAndPoll().catch(cause => {
        if (cancelled) return;
        setHederaLookupError(cause instanceof Error ? cause.message : t('Account lookup unavailable.'));
        setHederaMissing(false);
        consecutiveFailures += 1;
        scheduleNextPoll(exponentialBackoffDelay(8_000, consecutiveFailures));
      });
    }

    async function initializeAndPoll() {
      if (hederaKnownTransactions.current !== null && !hederaRequest) return;
      const account = await refreshHederaAccount();
      if (cancelled) return;
      setHederaLookupError(null);
      setHederaMissing(!account);
      if (!account) {
        setHederaReady(false);
        consecutiveFailures = 0;
        scheduleNextPoll(8_000);
        return;
      }
      const history = await loadHederaHistory(account.accountId, 10);
      if (hederaKnownTransactions.current === null) {
        hederaKnownTransactions.current = new Set(
          history.map(item => item.transactionId),
        );
        if (!cancelled) setHederaReady(true);
      } else {
        const incoming = findNewConfirmedIncomingHederaTransaction(
          history,
          hederaKnownTransactions.current,
          hederaExpectedAmountTinybars.current,
        );
        for (const item of history) {
          hederaKnownTransactions.current.add(item.transactionId);
        }
        if (incoming && !cancelled) {
          const description = t('{amount} HBAR confirmed on {network}.', { amount: incoming.amountHbar, network: HEDERA_NETWORK });
          setReceivedDescription(description);
          setReceivedExplorerUrl(incoming.hashscanUrl);
          setIsPaid(true);
          await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Success);
          try {
            const permissions = await Notifications.getPermissionsAsync();
            if (permissions.granted) {
              await Notifications.scheduleNotificationAsync({
                content: { title: t('Payment received'), body: description },
                trigger: null,
              });
            }
          } catch {
            // Notification availability must not change a confirmed payment state.
          }
          return;
        }
      }
      if (!hederaRequest) return;
      consecutiveFailures = 0;
      scheduleNextPoll(8_000);
    }

    runPoll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hederaPublicKey, hederaRequest, isPaid, network, networkSelected, pollingEnabled, refreshHederaAccount, walletReady]);

  function parseInvoiceAmount(): number {
    const value = Number(amountInput.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a positive amount.');
    const sats = isEur
      ? rates.btcToEur > 0
        ? Math.floor((value / rates.btcToEur) * 1e8)
        : 0
      : value;
    if (!Number.isSafeInteger(sats) || sats <= 0) {
      throw new Error(isEur ? 'The exchange rate is unavailable or amount is too small.' : 'Use whole satoshis.');
    }
    return sats;
  }

  async function generateInvoice() {
    if (!sparkWallet) return;
    setLoading(true);
    try {
      const amountSats = parseInvoiceAmount();
      await Notifications.requestPermissionsAsync();
      const result = await sparkWallet.createLightningInvoice({
        amountSats,
        memo: 'Deposit into Opago Wallet',
        expirySeconds: 600,
      });
      const rawInvoice =
        typeof result.invoice === 'string' ? result.invoice : result.invoice.encodedInvoice;
      const details = decodeLightningInvoice(rawInvoice);
      if (details.amountSats !== amountSats) throw new Error('Spark returned an invoice with the wrong amount.');
      if (typeof result.id !== 'string' || !result.id) {
        throw new Error('Spark returned no request identifier.');
      }
      const encodedRequest = 'lightning:' + details.invoice;
      await lightningReceiveStore.save({
        requestId: result.id,
        invoice: encodedRequest,
        paymentHash: details.paymentHash,
        amountSats,
        expiresAt: details.expiresAt || Date.now() + 600_000,
        createdAt: new Date().toISOString(),
      });
      setInvoice(encodedRequest);
      setInvoiceRequestId(result.id);
      setInvoicePaymentHash(details.paymentHash);
      setInvoiceAmountSats(amountSats);
      setInvoiceExpiresAt(details.expiresAt || Date.now() + 600_000);
      setIsPaid(false);
    } catch (cause) {
      Alert.alert(t('Could not create request'), t(cause instanceof Error ? cause.message : t('Bitcoin payments are unavailable.')));
    } finally {
      setLoading(false);
    }
  }

  async function prepareHederaRequest() {
    setLoading(true);
    try {
      const account = hederaAccount || await refreshHederaAccount();
      if (!account) throw new Error('No ' + HEDERA_NETWORK_LABEL + ' account exists for this wallet.');
      const amountTinybars = amountInput.trim()
        ? parseHederaTransferTinybars(amountInput)
        : null;
      hederaExpectedAmountTinybars.current = amountTinybars;
      setHederaRequest(buildHederaReceiveRequest(account.accountId, amountTinybars));
    } catch (cause) {
      Alert.alert(
        t('Could not create HBAR request'),
        t(cause instanceof Error ? cause.message : HEDERA_NETWORK_LABEL + ' is unavailable.'),
      );
    } finally {
      setLoading(false);
    }
  }

  const reset = useCallback(() => {
    setInvoice(null);
    setInvoiceRequestId(null);
    setInvoicePaymentHash(null);
    setInvoiceAmountSats(0);
    setInvoiceExpiresAt(null);
    setIsPaid(false);
    setReceivedDescription('');
    setReceivedExplorerUrl(null);
    hederaKnownTransactions.current = null;
    hederaExpectedAmountTinybars.current = null;
    setHederaReady(false);
    setHederaLookupError(null);
    setHederaMissing(false);
    setHederaRequest(null);
  }, []);

  const clearAndReset = useCallback(async () => {
    await lightningReceiveStore.clear();
    reset();
  }, [reset]);

  const finishReceiving = useCallback(() => {
    reset();
    setNetworkSelected(false);
    setNetwork('lightning');
    setAdvancedExpanded(false);
    setAmountInput('');
    setIsEur(true);
  }, [reset]);

  useEffect(() => {
    if (!isPaid) return;
    const timer = setTimeout(finishReceiving, 3_000);
    return () => clearTimeout(timer);
  }, [finishReceiving, isPaid]);

  useEffect(() => {
    if (!invoiceExpiresAt || isPaid) return;
    const remaining = invoiceExpiresAt - Date.now();
    if (remaining <= 0) {
      void clearAndReset();
      return;
    }
    const timer = setTimeout(() => void clearAndReset(), remaining);
    return () => clearTimeout(timer);
  }, [clearAndReset, invoiceExpiresAt, isPaid]);

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

  if (backupStatus === 'loading') return <View style={[styles.container, styles.centered]}><BackupStatusNotice /></View>;

  if (backupStatus !== 'verified' && backupStatus !== 'deferred') return (
    <View style={[styles.container, styles.centered]}>
      <Text style={styles.successTitle}>{t("Back up before adding money")}</Text>
      <Text style={styles.subtitle}>{t("Write down your recovery words and check your backup in Security.")}</Text>
      <TouchableOpacity style={[styles.button, styles.fullWidthButton]} accessibilityRole="button" onPress={() => { beginBackup(); router.push('/(tabs)/settings'); }}>
        <Text style={styles.buttonText}>{t("Back up my wallet")}</Text>
      </TouchableOpacity>
    </View>
  );

  if (isPaid) return (
    <View style={[styles.container, styles.centered]}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={50} color="#49d17d" accessibilityLabel={t("Confirmed")} />
      </View>
      <Text style={styles.successTitle}>{t("Payment received")}</Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        {receivedDescription || t('The payment is complete and saved in your activity.')}
      </Text>
      <TouchableOpacity
        style={[styles.button, styles.fullWidthButton, { marginTop: 24 }]}
        onPress={() => {
          finishReceiving();
          router.replace('/(tabs)');
        }}
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

  const qrValue =
    network === 'hedera'
        ? hederaRequest && hederaAccount
          ? buildHederaWalletQrValue(hederaAccount.accountId)
          : ''
        : invoice || '';

  const receiveNetworks: { network: ReceiveNetwork; asset: WalletAssetKey }[] = [
    { network: 'lightning', asset: 'lightning' },
    { network: 'hedera', asset: 'hedera' },
  ];
  const selectedReceiveNetwork = receiveNetworks.find(item => item.network === network)!;
  const selectedReceivePresentation = getWalletAssetPresentation(
    selectedReceiveNetwork.asset,
    appConfig.isMainnet,
    appConfig.hederaNetwork,
  );

  async function selectNetwork(next: ReceiveNetwork) {
    if (loading) return;
    setLoading(true);
    try {
      await clearAndReset();
      setNetwork(next);
      setNetworkSelected(true);
      setAdvancedExpanded(false);
      setAmountInput('');
      setIsEur(true);
    } catch {
      Alert.alert(t('Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function backToNetworks() {
    if (loading) return;
    setLoading(true);
    try {
      await clearAndReset();
      finishReceiving();
    } catch {
      Alert.alert(t('Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  const renderNetwork = (item: typeof receiveNetworks[number]) => {
    const presentation = getWalletAssetPresentation(item.asset, appConfig.isMainnet, appConfig.hederaNetwork);
    return (
      <TouchableOpacity
        key={item.network}
        style={styles.receiveNetworkSelector}
        onPress={() => void selectNetwork(item.network)}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={`${presentation.name}, ${presentation.networkLabel}`}
      >
        <AssetIcon asset={item.asset} size={34} />
        <Text style={styles.receiveNetworkText}>{presentation.name}</Text>
        <Text style={styles.receiveNetworkMeta}>{presentation.networkBadge}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled"
    >
      {networkSelected && <PaymentBackButton onPress={() => void backToNetworks()} disabled={loading} label={t('Back to payment methods')} />}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{t('Receive {asset}', { asset: networkSelected ? selectedReceivePresentation.name : 'Bitcoin' })}</Text>
          <Text style={styles.screenSubtitle}>{t('Create a payment request to get paid.')}</Text>
        </View>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} />
      </View>
      <BackupReminder />
      {networkSelected && network === 'hedera' && (
        <View style={styles.modeNotice}>
          <View style={[styles.modeNoticeIcon, HEDERA_NETWORK === 'mainnet' && styles.modeNoticeIconLive]}>
            <Ionicons
              name={HEDERA_NETWORK === 'mainnet' ? 'shield-checkmark' : 'flask-outline'}
              size={18}
              color={HEDERA_NETWORK === 'mainnet' ? '#49d17d' : '#b7a8ff'}
            />
          </View>
          <View style={styles.modeNoticeCopy}>
              <Text style={styles.modeNoticeTitle}>HBAR · {HEDERA_NETWORK_BADGE}</Text>
              <Text style={styles.modeNoticeText}>
                {HEDERA_NETWORK === 'mainnet'
                  ? t('Real payments are active.')
                  : t('Test payments only — no real value.')}
              </Text>
          </View>
        </View>
      )}
      <View style={styles.card}>
        {!networkSelected ? (
          <>
            <View style={styles.receiveNetworkRow}>
              {receiveNetworks.filter(item => item.network === 'lightning').map(renderNetwork)}
            </View>
            <AdvancedOptions expanded={advancedExpanded} onChange={setAdvancedExpanded} disabled={loading}>
              <View style={styles.receiveNetworkRow}>{receiveNetworks.filter(item => item.network !== 'lightning').map(renderNetwork)}</View>
            </AdvancedOptions>
          </>
        ) : (
          <>
            <View style={styles.selectedAssetRow}>
              <AssetIcon asset={selectedReceiveNetwork.asset} size={38} />
              <View style={styles.selectedAssetCopy}>
                <Text style={styles.selectedAssetTitle}>{selectedReceivePresentation.name}</Text>
                <Text style={styles.selectedAssetMeta}>{selectedReceivePresentation.networkBadge}</Text>
              </View>

            </View>

        {network === 'lightning' && !invoice && (
          <>
            <Text style={styles.label}>{t("Amount")}</Text>
            <TextInput
              style={styles.input}
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder={isEur ? '0.00 EUR' : t('Satoshis')}
              placeholderTextColor="#666"
            />
            <View style={styles.row}>
              {(['EUR', 'SAT'] as const).map(currency => {
                const selected = isEur ? currency === 'EUR' : currency === 'SAT';
                return (
                  <TouchableOpacity
                    key={currency}
                    style={[styles.selector, selected && styles.selectorActive]}
                    onPress={() => setIsEur(currency === 'EUR')}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <Text style={[styles.selectorText, selected && styles.selectorTextActive]}>{currency}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.button} onPress={() => void generateInvoice()} disabled={loading || !walletReady}>
              {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>{t("Create request")}</Text>}
            </TouchableOpacity>
          </>
        )}

        {network === 'hedera' && (
          <>
            {hederaLookupError ? (
              <Text style={styles.errorText}>
                {t("Account verification unavailable:")} {t(hederaLookupError)} {t("Retrying automatically. If you already deposited, wait for verification before sending again.")}</Text>
            ) : hederaMissing && hederaPublicKey ? (
              <HederaActivation publicKey={hederaPublicKey} network={HEDERA_NETWORK_BADGE} />
            ) : !hederaReady ? (
              <ActivityIndicator color="#ffb000" />
            ) : hederaAccount ? (
              <>
                <Text style={styles.label}>{t("Your HBAR account")}</Text>
                <TouchableOpacity
                  style={styles.proofBox}
                  onPress={() => void copy(hederaAccount.accountId)}
                  accessibilityRole="button"
                  accessibilityLabel={t("Copy Hedera account ID")}
                >
                  <Text style={styles.accountDisplay}>{compactWalletIdentifier(hederaAccount.accountId)}</Text>
                  <View style={styles.copyHint}>
                    <Ionicons name="copy-outline" size={15} color="#8f8f9d" />
                    <Text style={styles.copyHintText}>{t("Tap to copy")}</Text>
                  </View>
                </TouchableOpacity>
                {!hederaRequest && (
                  <>
                    <Text style={styles.label}>{t("Amount (optional)")}</Text>
                    <TextInput
                      style={styles.input}
                      value={amountInput}
                      onChangeText={setAmountInput}
                      keyboardType="decimal-pad"
                      placeholder={t("Leave empty for an open request")}
                      placeholderTextColor="#666"
                    />
                    <TouchableOpacity style={styles.button} onPress={() => void prepareHederaRequest()} disabled={loading}>
                      {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>{t("Create payment QR")}</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.errorText}>{t('No {network} account was found.', { network: HEDERA_NETWORK_LABEL })}</Text>
            )}
          </>
        )}

        {qrValue && (
          <View style={styles.qrSection}>
            <View style={styles.qrCard}>
              <QRCode value={qrValue} size={210} />
            </View>
            {network === 'hedera' && (
              <Text style={[styles.subtitle, styles.centerText]}>
                {t("Works with HashPack and other Hedera wallets. Confirm the amount in the sending wallet.")}</Text>
            )}
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => void copy(qrValue)}>
              <View style={styles.buttonContent}>
                <Ionicons name="copy-outline" size={18} color="#fff" />
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                  {network === 'hedera' ? t('Copy account ID') : t('Copy payment link')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

          </>
        )}
      </View>
      {networkSelected && network === 'lightning' && !invoice && <AdvancedOptions expanded={advancedExpanded} onChange={setAdvancedExpanded} disabled={loading}>
        <View style={styles.receiveNetworkRow}>{receiveNetworks.filter(item => item.network !== 'lightning').map(renderNetwork)}</View>
      </AdvancedOptions>}
    </ScrollView>
  );
}
