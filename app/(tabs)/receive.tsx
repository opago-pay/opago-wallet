import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { AssetIcon } from '@/components/ui/asset-icon';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { appConfig } from '@/lib/config';
import { addTransaction } from '@/lib/database';
import {
  findNewConfirmedIncomingHederaTransaction,
  loadHederaHistory,
} from '@/lib/hedera/account';
import {
  buildHederaReceiveRequest,
  parseHederaTransferTinybars,
} from '@/lib/hedera/payments';
import {
  HEDERA_NETWORK,
  HEDERA_NETWORK_BADGE,
  HEDERA_NETWORK_LABEL,
} from '@/lib/hedera/config';
import { decodeLightningInvoice } from '@/lib/lightning';
import { sparkTransferMatchesInvoice } from '@/lib/payments';
import {
  buildSolanaReceiveRequest,
  findNewConfirmedIncomingSolanaTransaction,
  getSolanaReceiveSnapshot,
  parseSolanaAssetAmount,
  type SolanaAsset,
  type SolanaReceiveSnapshot,
} from '@/lib/solana';
import { openSolanaExplorerUrl } from '@/lib/solana/explorer-native';
import { openHederaExplorerUrl } from '@/lib/hedera/explorer-native';
import { sendStyles as styles } from '@/styles/send-styles';
import { getWalletAssetPresentation, type WalletAssetKey } from '@/lib/wallet-assets';
import { compactWalletIdentifier } from '@/lib/wallet-display';
import { exponentialBackoffDelay } from '@/lib/retry';
import { buildHederaActivationAlias } from '@/lib/hedera/keys';

type ReceiveNetwork = 'lightning' | 'solana' | 'usdc' | 'hedera';

export default function ReceiveScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const rates = useExchangeRates();
  const {
    sparkWallet,
    walletReady,
    loadOrGenerateWallet,
    solanaKeypair,
    hederaAccount,
    hederaPublicKey,
    refreshHederaAccount,
  } = useWalletAuth();
  const [network, setNetwork] = useState<ReceiveNetwork>('lightning');
  const [invoice, setInvoice] = useState<string | null>(null);
  const [invoicePaymentHash, setInvoicePaymentHash] = useState<string | null>(null);
  const [invoiceAmountSats, setInvoiceAmountSats] = useState(0);
  const [amountInput, setAmountInput] = useState('10');
  const [isEur, setIsEur] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [receivedDescription, setReceivedDescription] = useState('');
  const [receivedExplorerUrl, setReceivedExplorerUrl] = useState<string | null>(null);
  const solanaSnapshot = useRef<SolanaReceiveSnapshot | null>(null);
  const [solanaReady, setSolanaReady] = useState(false);
  const solanaExpectedAmountBaseUnits = useRef<bigint | null>(null);
  const [solanaRequest, setSolanaRequest] = useState<string | null>(null);
  const hederaKnownTransactions = useRef<Set<string> | null>(null);
  const hederaExpectedAmountTinybars = useRef<bigint | null>(null);
  const [hederaReady, setHederaReady] = useState(false);
  const [hederaLookupError, setHederaLookupError] = useState<string | null>(null);
  const [hederaMissing, setHederaMissing] = useState(false);
  const [hederaRequest, setHederaRequest] = useState<string | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const pollingEnabled = isFocused && appIsActive;

  useEffect(() => {
    hederaKnownTransactions.current = null;
    hederaExpectedAmountTinybars.current = null;
    setHederaRequest(null);
    setHederaReady(false);
    setHederaMissing(false);
    setHederaLookupError(null);
  }, [hederaPublicKey]);

  useEffect(() => {
    if (!walletReady) void loadOrGenerateWallet();
  }, [loadOrGenerateWallet, walletReady]);

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
    setReceivedDescription(amount + ' ' + asset + ' confirmed.');
    setIsPaid(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Payment received', body: amount + ' ' + asset + ' confirmed.' },
      trigger: null,
    });
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
        const { transfers } = await sparkWallet.getTransfers(20, 0);
        const matching = transfers?.find((transfer: unknown) =>
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
  }, [invoice, invoiceAmountSats, invoicePaymentHash, isPaid, markPaid, pollingEnabled, sparkWallet]);

  useEffect(() => {
    if (
      !pollingEnabled ||
      (network !== 'solana' && network !== 'usdc') ||
      !solanaKeypair ||
      isPaid
    ) return;
    const activeKeypair = solanaKeypair;
    const activeAsset: SolanaAsset = network === 'usdc' ? 'USDC' : 'SOL';
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;

    function scheduleNextPoll(delayMs: number) {
      if (cancelled) return;
      timer = setTimeout(runPoll, delayMs);
    }

    function runPoll() {
      void initializeAndPoll().catch(() => {
        consecutiveFailures += 1;
        scheduleNextPoll(exponentialBackoffDelay(12_000, consecutiveFailures));
      });
    }

    async function initializeAndPoll() {
      if (!solanaSnapshot.current) {
        solanaSnapshot.current = await getSolanaReceiveSnapshot(activeKeypair.publicKey);
      }
      if (!cancelled) setSolanaReady(true);
      if (!solanaRequest) return;
      const incoming = await findNewConfirmedIncomingSolanaTransaction({
        address: activeKeypair.publicKey,
        sinceSignature: solanaSnapshot.current.latestSignature,
        asset: activeAsset,
        expectedAmountBaseUnits: solanaExpectedAmountBaseUnits.current,
      });
      if (incoming && !cancelled) {
        const description = incoming.amountDisplay + ' ' + incoming.asset + ' confirmed on ' +
          (appConfig.isMainnet ? 'mainnet.' : 'devnet.');
        setReceivedDescription(description);
        setReceivedExplorerUrl(incoming.explorerUrl);
        setIsPaid(true);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try {
          const permissions = await Notifications.getPermissionsAsync();
          if (permissions.granted) {
            await Notifications.scheduleNotificationAsync({
              content: { title: 'Solana payment received', body: description },
              trigger: null,
            });
          }
        } catch {
          // Notification availability must not change a confirmed payment state.
        }
        return;
      }
      consecutiveFailures = 0;
      scheduleNextPoll(12_000);
    }

    runPoll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isPaid, network, pollingEnabled, solanaKeypair, solanaRequest]);

  useEffect(() => {
    if (!pollingEnabled || network !== 'hedera' || !walletReady || isPaid) return;
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
        setHederaLookupError(cause instanceof Error ? cause.message : 'Account lookup unavailable.');
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
          const description = incoming.amountHbar + ' HBAR confirmed on ' + HEDERA_NETWORK + '.';
          setReceivedDescription(description);
          setReceivedExplorerUrl(incoming.hashscanUrl);
          setIsPaid(true);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          try {
            const permissions = await Notifications.getPermissionsAsync();
            if (permissions.granted) {
              await Notifications.scheduleNotificationAsync({
                content: { title: HEDERA_NETWORK_BADGE + ' HBAR received', body: description },
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
  }, [hederaPublicKey, hederaRequest, isPaid, network, pollingEnabled, refreshHederaAccount, walletReady]);

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
      setInvoice('lightning:' + details.invoice);
      setInvoicePaymentHash(details.paymentHash);
      setInvoiceAmountSats(amountSats);
      setIsPaid(false);
    } catch (cause) {
      Alert.alert('Invoice creation failed', cause instanceof Error ? cause.message : 'Spark is unavailable.');
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
        'Could not create HBAR request',
        cause instanceof Error ? cause.message : HEDERA_NETWORK_LABEL + ' is unavailable.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function prepareSolanaRequest() {
    if (!solanaKeypair || (network !== 'solana' && network !== 'usdc')) return;
    setLoading(true);
    try {
      const asset: SolanaAsset = network === 'usdc' ? 'USDC' : 'SOL';
      const amountBaseUnits = amountInput.trim()
        ? parseSolanaAssetAmount(amountInput, asset)
        : null;
      solanaExpectedAmountBaseUnits.current = amountBaseUnits;
      setSolanaRequest(buildSolanaReceiveRequest({
        recipientAddress: solanaKeypair.publicKey.toBase58(),
        asset,
        amountBaseUnits,
      }));
    } catch (cause) {
      Alert.alert(
        'Could not create Solana request',
        cause instanceof Error ? cause.message : 'Solana is unavailable.',
      );
    } finally {
      setLoading(false);
    }
  }

  const reset = useCallback(() => {
    setInvoice(null);
    setInvoicePaymentHash(null);
    setInvoiceAmountSats(0);
    setIsPaid(false);
    setReceivedDescription('');
    setReceivedExplorerUrl(null);
    solanaSnapshot.current = null;
    setSolanaReady(false);
    solanaExpectedAmountBaseUnits.current = null;
    setSolanaRequest(null);
    hederaKnownTransactions.current = null;
    hederaExpectedAmountTinybars.current = null;
    setHederaReady(false);
    setHederaLookupError(null);
    setHederaMissing(false);
    setHederaRequest(null);
  }, []);

  useFocusEffect(useCallback(() => reset, [reset]));

  async function copy(value: string) {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', 'Payment information copied to your clipboard.');
  }

  async function openReceivedTransaction() {
    if (!receivedExplorerUrl) return;
    try {
      if (network === 'hedera') {
        await openHederaExplorerUrl(receivedExplorerUrl);
      } else {
        await openSolanaExplorerUrl(receivedExplorerUrl);
      }
    } catch (cause) {
      Alert.alert(
        'Could not open receipt',
        cause instanceof Error ? cause.message : 'The explorer link is invalid.',
      );
    }
  }

  if (isPaid) return (
    <View style={[styles.container, styles.centered]}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={50} color="#49d17d" accessibilityLabel="Confirmed" />
      </View>
      <Text style={styles.successTitle}>Payment received</Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        {receivedDescription || 'The payment is complete and saved in your activity.'}
      </Text>
      <TouchableOpacity
        style={[styles.button, styles.fullWidthButton, { marginTop: 24 }]}
        onPress={() => router.replace('/(tabs)')}
      >
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
      {receivedExplorerUrl && (
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
          onPress={() => void openReceivedTransaction()}
          accessibilityRole="link"
          accessibilityLabel="View payment receipt"
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>View receipt</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.textButton} onPress={reset}>
        <Text style={styles.textButtonText}>Request another payment</Text>
      </TouchableOpacity>
    </View>
  );

  const solanaAddress = solanaKeypair?.publicKey.toBase58() || '';
  const qrValue =
    network === 'solana' || network === 'usdc'
      ? solanaRequest || ''
      : network === 'hedera'
        ? hederaRequest || ''
        : invoice || '';

  const receiveNetworks: { network: ReceiveNetwork; asset: WalletAssetKey }[] = [
    { network: 'lightning', asset: 'lightning' },
    { network: 'solana', asset: 'solana' },
    { network: 'usdc', asset: 'usdc' },
    { network: 'hedera', asset: 'hedera' },
  ];

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Request money</Text>
          <Text style={styles.screenSubtitle}>Choose how you want to get paid.</Text>
        </View>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} />
      </View>
      {network === 'hedera' && (
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
                  ? 'Real payments are active.'
                  : 'Test payments only — no real value.'}
              </Text>
          </View>
        </View>
      )}
      {(network === 'solana' || network === 'usdc') && !appConfig.isMainnet && (
        <View style={styles.modeNotice}>
          <View style={styles.modeNoticeIcon}>
            <Ionicons name="flask-outline" size={18} color="#b7a8ff" />
          </View>
          <View style={styles.modeNoticeCopy}>
            <Text style={styles.modeNoticeTitle}>
              {network === 'usdc' ? 'USDC' : 'Solana'} · DEVNET
            </Text>
            <Text style={styles.modeNoticeText}>Test payments only — no real value.</Text>
          </View>
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.label}>Receive with</Text>
        <View style={styles.receiveNetworkRow}>
          {receiveNetworks.map(item => {
            const presentation = getWalletAssetPresentation(
              item.asset,
              appConfig.isMainnet,
              appConfig.hederaNetwork,
            );
            const selected = network === item.network;
            return (
              <TouchableOpacity
                key={item.network}
                style={[styles.receiveNetworkSelector, selected && styles.selectorActive]}
                onPress={() => {
                  reset();
                  setNetwork(item.network);
                  setAmountInput(item.network === 'lightning' ? '10' : '');
                  setIsEur(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${presentation.name}, ${presentation.networkLabel}`}
              >
                <AssetIcon asset={item.asset} size={34} />
                <Text style={[styles.receiveNetworkText, selected && styles.selectorTextActive]}>
                  {presentation.name}
                </Text>
                <Text style={styles.receiveNetworkMeta}>{presentation.networkBadge}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {network === 'lightning' && !invoice && (
          <>
            <Text style={styles.label}>Invoice amount</Text>
            <TextInput
              style={styles.input}
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder={isEur ? 'Euro' : 'Satoshis'}
              placeholderTextColor="#666"
            />
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton, styles.currencyToggle]}
              onPress={() => setIsEur(value => !value)}
              accessibilityRole="button"
              accessibilityLabel={`Amount entered in ${isEur ? 'EUR' : 'SAT'}. Tap to switch currency.`}
            >
              <View style={styles.buttonContent}>
                <Ionicons name="swap-horizontal" size={18} color="#fff" />
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                  {isEur ? 'Entered in EUR' : 'Entered in SAT'}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { marginTop: 18 }]} onPress={() => void generateInvoice()} disabled={loading || !walletReady}>
              {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Create 10-minute invoice</Text>}
            </TouchableOpacity>
          </>
        )}

        {network === 'hedera' && (
          <>
            {hederaLookupError ? (
              <Text style={styles.errorText}>
                Account verification unavailable: {hederaLookupError} Retrying automatically. If you already deposited, wait for verification before sending again.
              </Text>
            ) : hederaMissing && hederaPublicKey ? (
              <>
                <Text style={styles.label}>Add HBAR to get started</Text>
                <Text style={styles.subtitle}>
                  Send HBAR to the QR code below from a compatible Hedera wallet. Your Opago wallet will become ready automatically after the first deposit.
                </Text>
                <View style={{ backgroundColor: '#fff', padding: 16, alignSelf: 'center', marginVertical: 16 }}>
                  <QRCode value={buildHederaActivationAlias(hederaPublicKey)} size={220} />
                </View>
                <TouchableOpacity
                  style={styles.proofBox}
                  onPress={() => void copy(buildHederaActivationAlias(hederaPublicKey))}
                  accessibilityRole="button"
                  accessibilityLabel="Copy Hedera activation alias"
                >
                  <Text style={styles.proofText} selectable>{buildHederaActivationAlias(hederaPublicKey)}</Text>
                    <Text style={styles.copyHintText}>Tap to copy deposit address</Text>
                </TouchableOpacity>
                <Text style={styles.subtitle}>
                  Choose Hedera {HEDERA_NETWORK_BADGE} in the sending wallet. Keep this screen open while Opago checks for the deposit.
                </Text>
                <Text style={styles.subtitle}>
                  Already sent it? We are checking automatically. This can take a short moment.
                </Text>
              </>
            ) : !hederaReady ? (
              <ActivityIndicator color="#ffb000" />
            ) : hederaAccount ? (
              <>
                <Text style={styles.label}>Your HBAR account</Text>
                <TouchableOpacity
                  style={styles.proofBox}
                  onPress={() => void copy(hederaAccount.accountId)}
                  accessibilityRole="button"
                  accessibilityLabel="Copy Hedera account ID"
                >
                  <Text style={styles.accountDisplay}>{compactWalletIdentifier(hederaAccount.accountId)}</Text>
                  <View style={styles.copyHint}>
                    <Ionicons name="copy-outline" size={15} color="#8f8f9d" />
                    <Text style={styles.copyHintText}>Tap to copy</Text>
                  </View>
                </TouchableOpacity>
                {!hederaRequest && (
                  <>
                    <Text style={styles.label}>Amount (optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={amountInput}
                      onChangeText={setAmountInput}
                      keyboardType="decimal-pad"
                      placeholder="Leave empty for an open request"
                      placeholderTextColor="#666"
                    />
                    <TouchableOpacity style={styles.button} onPress={() => void prepareHederaRequest()} disabled={loading}>
                      {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Create payment QR</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.errorText}>No {HEDERA_NETWORK_LABEL} account was found.</Text>
            )}
          </>
        )}

        {(network === 'solana' || network === 'usdc') && (
          <>
            {!solanaReady ? (
              <ActivityIndicator color="#ffb000" />
            ) : solanaAddress ? (
              <>
                <Text style={styles.label}>Your payment address</Text>
                <TouchableOpacity
                  style={styles.proofBox}
                  onPress={() => void copy(solanaAddress)}
                  accessibilityRole="button"
                  accessibilityLabel="Copy Solana wallet address"
                >
                  <Text style={styles.accountDisplay}>{compactWalletIdentifier(solanaAddress)}</Text>
                  <View style={styles.copyHint}>
                    <Ionicons name="copy-outline" size={15} color="#8f8f9d" />
                    <Text style={styles.copyHintText}>Tap to copy</Text>
                  </View>
                </TouchableOpacity>
                {!solanaRequest && (
                  <>
                    <Text style={styles.label}>
                      Amount (optional)
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={amountInput}
                      onChangeText={setAmountInput}
                      keyboardType="decimal-pad"
                      placeholder="Leave empty for an open request"
                      placeholderTextColor="#666"
                    />
                    <TouchableOpacity
                      style={styles.button}
                      onPress={() => void prepareSolanaRequest()}
                      disabled={loading}
                    >
                      {loading
                        ? <ActivityIndicator color="#111" />
                        : <Text style={styles.buttonText}>
                            Create payment QR
                          </Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.errorText}>Solana wallet is not ready.</Text>
            )}
          </>
        )}

        {qrValue && (
          <View style={styles.qrSection}>
            <View style={styles.qrCard}>
              <QRCode value={qrValue} size={210} />
            </View>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => void copy(qrValue)}>
              <View style={styles.buttonContent}>
                <Ionicons name="copy-outline" size={18} color="#fff" />
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>Copy payment link</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {(network === 'solana' || network === 'usdc') && !solanaAddress && (
          <Text style={styles.errorText}>Solana wallet is not ready.</Text>
        )}
        {(network === 'solana' || network === 'usdc') && solanaAddress && !solanaReady && (
          <ActivityIndicator color="#ffb000" />
        )}
      </View>
    </ScrollView>
  );
}
