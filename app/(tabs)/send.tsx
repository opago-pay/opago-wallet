import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { paymentScanInbox } from '@/lib/payment-scan';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import { fetchInvoiceFromLNURLP } from '@/lib/lnurl-safe';
import { fetchOcpExecutionPayload, fetchOcpOptions, resolveOcpUrl } from '@/lib/ocp-safe';
import { resolveLightningDestination, type LightningAmountRequirement } from '@/lib/lightning-destination';
import { friendlyPaymentMessage } from '@/lib/payment-errors';
import {
  inferPaymentSourceFromRequest,
  parsePaymentAmount,
} from '@/lib/payment-input';
import {
  LightningPaymentPendingError,
  payPreparedSparkPayment,
  prepareSparkPayment,
  type SparkPaymentResult,
} from '@/lib/payments';
import { authorizePayment } from '@/lib/payment-authorization';
import { notifyPaymentHaptics } from '@/lib/optional-haptics';
import { lightningPaymentLifecycle, reconcileLightningPayments } from '@/lib/lightning/reconcile-native';
import { startEIdSession, waitForVerifiedEId } from '@/lib/eid';
import { PaymentForm } from '@/components/send/payment-form';
import {
  HederaReviewView,
  HederaSuccessView,
} from '@/components/send/hedera-payment-views';
import {
  LightningReviewView,
  LightningSuccessView,
} from '@/components/send/lightning-payment-views';
import {
  HEDERA_NETWORK_LABEL,
} from '@/lib/hedera/config';
import {
  parseHederaCheckoutRequest,
  verifyHederaCheckoutRequest,
} from '@/lib/hedera/checkout';
import { openHederaExplorerUrl } from '@/lib/hedera/explorer-native';
import {
  assertHederaPaymentBalance,
  formatTinybars,
  HederaPaymentPendingError,
  parseHederaPaymentRequest,
  parseHederaTransferTinybars,
  type HederaTransferResult,
} from '@/lib/hedera/payments';
import {
  IdentityRequiredView,
  OcpQuoteView,
} from '@/components/send/payment-state-views';
import type {
  OcpOption,
  OcpState,
  PaymentCurrency,
  PaymentSource,
  PendingEId,
  PendingHederaPayment,
  PendingLightningPayment,
} from '@/components/send/types';

const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : t('Payment failed.');

function isExpectedEIdDeepLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'opagowallet:' && url.hostname === 'eid-success';
  } catch {
    return false;
  }
}

export default function SendScreen() {
  useLanguage();
  const router = useRouter();
  const { hederaRequest, hederaRequestKey, scanResultKey } = useLocalSearchParams<{
    hederaRequest?: string | string[];
    hederaRequestKey?: string | string[];
    scanResultKey?: string | string[];
  }>();
  const rates = useExchangeRates();
  const [source, setSource] = useState<PaymentSource>('spark');
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const {
    sparkWallet,
    walletReady,
    hederaPublicKey,
    hederaAccount,
    loadOrGenerateWallet,
    refreshHederaAccount,
    sendHederaPayment,
    error: walletError,
  } = useWalletAuth();
  const { balances, balanceStates, balanceError } = useWalletBalances({
    walletReady,
    sparkWallet,
    refreshHederaAccount,
    initializationError: walletError,
    enableHedera: advancedExpanded || source === 'hedera',
  });
  const [destination, setDestination] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [amountRequirement, setAmountRequirement] = useState<LightningAmountRequirement | null>(null);
  const [currency, setCurrency] = useState<PaymentCurrency>('SAT');
  const [sourceSelected, setSourceSelected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lightningResult, setLightningResult] = useState<SparkPaymentResult | null>(null);
  const [pendingLightning, setPendingLightning] = useState<PendingLightningPayment | null>(null);
  const [pendingHedera, setPendingHedera] = useState<PendingHederaPayment | null>(null);
  const [hederaResult, setHederaResult] = useState<HederaTransferResult | null>(null);
  const [ocpState, setOcpState] = useState<OcpState | null>(null);
  const [selectedOcpOption, setSelectedOcpOption] = useState<OcpOption | null>(null);
  const [pendingEId, setPendingEId] = useState<PendingEId | null>(null);
  const [eIdSessionId, setEIdSessionId] = useState<string | null>(null);
  const [eIdDemo, setEIdDemo] = useState(false);
  const waitingForEId = useRef(false);
  const completingEId = useRef(false);
  const paymentInFlight = useRef(false);
  const consumedHederaRequestKey = useRef<string | null>(null);
  const consumedScanRequest = useRef<string | null>(null);

  useFocusEffect(useCallback(() => {
    // Resolve ambiguous earlier submissions when the user opens Send (or Home
    // history), without scanning transaction history during balance startup.
    if (sparkWallet) void reconcileLightningPayments(sparkWallet).catch(() => undefined);
  }, [sparkWallet]));

  useEffect(() => {
    if (!walletReady) void loadOrGenerateWallet().catch(() => undefined); // Provider retains the error.
  }, [loadOrGenerateWallet, walletReady]);

  useEffect(() => {
    if (
      typeof hederaRequest !== 'string' ||
      typeof hederaRequestKey !== 'string' ||
      consumedHederaRequestKey.current === hederaRequestKey
    ) {
      return;
    }
    consumedHederaRequestKey.current = hederaRequestKey;
    setSource('hedera');
    setSourceSelected(true);
    setDestination(hederaRequest);
    setAmountInput('');
    setAmountRequirement(null);
    setPendingHedera(null);
    setHederaResult(null);
  }, [hederaRequest, hederaRequestKey]);

  const prepareLightningInvoice = useCallback(async (
    invoice: string,
    requestedAmount?: number,
    recipientLabel = t('Lightning payment request'),
  ) => {
    if (!sparkWallet) throw new Error('Spark wallet is not ready.');
    const payment = await prepareSparkPayment(sparkWallet, invoice, requestedAmount);
    setPendingLightning({ ...payment, recipientLabel });
  }, [sparkWallet]);

  const finishEIdPayment = useCallback(async () => {
    if (!pendingEId || !eIdSessionId || completingEId.current) return;
    completingEId.current = true;
    waitingForEId.current = false;
    setLoading(true);
    try {
      const payerData = await waitForVerifiedEId(eIdSessionId);
      const invoice = await fetchInvoiceFromLNURLP(
        pendingEId.lnurl.callback,
        pendingEId.amountSats,
        payerData,
      );
      await prepareLightningInvoice(invoice, pendingEId.amountSats, t('Verified payment request'));
      setPendingEId(null);
      setEIdSessionId(null);
    } catch (cause) {
      Alert.alert(t('Identity verification failed'), t(messageOf(cause)));
      await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Error);
    } finally {
      completingEId.current = false;
      setLoading(false);
    }
  }, [eIdSessionId, pendingEId, prepareLightningInvoice]);

  useEffect(() => {
    const appSub = AppState.addEventListener('change', state => {
      if (state === 'active' && waitingForEId.current) void finishEIdPayment();
    });
    const linkSub = Linking.addEventListener('url', event => {
      if (isExpectedEIdDeepLink(event.url) && waitingForEId.current) void finishEIdPayment();
    });
    return () => {
      appSub.remove();
      linkSub.remove();
    };
  }, [finishEIdPayment]);

  async function beginEIdVerification() {
    if (!pendingEId) return;
    setLoading(true);
    try {
      const session = await startEIdSession({
        walletIdentifier: hederaAccount?.accountId || hederaPublicKey || 'local-wallet',
        transactionReference: 'lnurl:' + new URL(pendingEId.lnurl.callback).origin,
      });
      setEIdSessionId(session.sessionId);
      setEIdDemo(session.demo);
      waitingForEId.current = true;
      if (session.demo) {
        Alert.alert(t('Demo identity session'), t('This is explicitly not a legal eID verification.'));
      }
      const clientUrl =
        'eid://127.0.0.1:24727/eID-Client?tcTokenURL=' + encodeURIComponent(session.tcTokenURL);
      if (Platform.OS === 'android') {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: clientUrl,
          flags: 268435456,
        });
      } else {
        await Linking.openURL(clientUrl);
      }
    } catch (cause) {
      waitingForEId.current = false;
      Alert.alert(t('Could not start AusweisApp'), t(messageOf(cause)));
    } finally {
      setLoading(false);
    }
  }

  const handleDestination = useCallback(async (
    scannedValue?: string,
    sourceOverride?: PaymentSource,
  ) => {
    const enteredAmountInput = scannedValue === undefined ? amountInput : '';
    const raw = (scannedValue ?? destination).trim();
    const activeSource = sourceOverride || source;
    if (!raw) {
      Alert.alert(t('Who are you paying?'), t('Scan a payment QR code or enter the recipient.'));
      return;
    }
    setLoading(true);
    try {
      if (activeSource === 'hedera') {
        const checkoutRequest = parseHederaCheckoutRequest(raw);
        const directRequest = checkoutRequest ? null : parseHederaPaymentRequest(raw);
        const enteredAmount = enteredAmountInput.trim()
          ? parseHederaTransferTinybars(enteredAmountInput)
          : null;
        const requestedAmount = checkoutRequest?.amountTinybars ?? directRequest?.amountTinybars;
        if (
          requestedAmount !== null &&
          requestedAmount !== undefined &&
          enteredAmount !== null &&
          requestedAmount !== enteredAmount
        ) {
          throw new Error('The entered HBAR amount does not match the scanned payment request.');
        }
        const amountTinybars = requestedAmount ?? enteredAmount;
        if (amountTinybars === null) {
          if (scannedValue !== undefined) return; // Let the user enter the requested amount.
          throw new Error('Enter an HBAR amount or scan a request that includes one.');
        }
        const sourceAccount = hederaAccount || await refreshHederaAccount();
        if (!sourceAccount) {
          throw new Error('No ' + HEDERA_NETWORK_LABEL + ' account exists for this recovery phrase.');
        }
        assertHederaPaymentBalance(
          amountTinybars,
          sourceAccount.balanceTinybars,
          checkoutRequest ? 'checkout' : 'direct',
        );
        if (checkoutRequest) await verifyHederaCheckoutRequest(checkoutRequest);
        setPendingHedera({
          recipientAccountId:
            checkoutRequest?.merchantAccountId ?? directRequest!.accountId,
          amountTinybars,
          amountHbar: formatTinybars(amountTinybars),
          checkoutRequest: checkoutRequest ?? undefined,
        });
        return;
      }

      const ocpUrl = await resolveOcpUrl(raw);
      if (ocpUrl) {
        try {
          setOcpState({ callbackUrl: ocpUrl, quote: await fetchOcpOptions(ocpUrl) });
          setSelectedOcpOption(null);
          return;
        } catch {
          // Standard LNURL-pay endpoints intentionally fall through.
        }
      }
      const requested = parsePaymentAmount(enteredAmountInput, currency, rates.btcToEur);
      const resolved = await resolveLightningDestination(raw, requested);
      if (resolved.kind === 'amount-required') {
        setAmountRequirement(resolved.limits);
        return;
      }
      setAmountRequirement(null);
      await prepareLightningInvoice(
        resolved.invoice,
        resolved.amountSats,
        resolved.recipientLabel ?? t('Lightning payment request'),
      );
    } catch (cause) {
      Alert.alert(
        t('Check this payment'),
        t(friendlyPaymentMessage(
          cause,
          activeSource === 'hedera' ? 'HBAR' : 'Bitcoin',
        )),
      );
      await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [amountInput, currency, destination, hederaAccount, prepareLightningInvoice, rates.btcToEur, refreshHederaAccount, source]);

  async function executeHederaPayment() {
    if (!pendingHedera || paymentInFlight.current) return;
    paymentInFlight.current = true;
    setLoading(true);
    try {
      const result = await sendHederaPayment({
        recipientAccountId: pendingHedera.recipientAccountId,
        amountTinybars: pendingHedera.amountTinybars,
        checkoutRequest: pendingHedera.checkoutRequest,
      });
      setPendingHedera(null);
      setHederaResult(result);
      await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      const isPending = cause instanceof HederaPaymentPendingError;
      if (isPending) setPendingHedera(null);
      Alert.alert(
        t(isPending ? t('Payment is still processing') : t('Payment not completed')),
        t(isPending
          ? t('Do not send it again. Open Home and refresh Recent activity to check the final result.')
          : friendlyPaymentMessage(cause, 'HBAR')),
      );
      await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Error);
    } finally {
      paymentInFlight.current = false;
      setLoading(false);
    }
  }

  async function executeLightningPayment() {
    if (!pendingLightning || !sparkWallet || paymentInFlight.current) return;
    paymentInFlight.current = true;
    setLoading(true);
    try {
      const assertAuthorized = await authorizePayment();
      const result = await payPreparedSparkPayment(
        sparkWallet,
        pendingLightning,
        lightningPaymentLifecycle,
        assertAuthorized,
      );
      setPendingLightning(null);
      setLightningResult(result);
      try {
        await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Haptics are optional and cannot invalidate a proof-backed payment.
      }
    } catch (cause) {
      const isPending = cause instanceof LightningPaymentPendingError;
      if (isPending) setPendingLightning(null);
      Alert.alert(
        t(isPending ? t('Payment is still processing') : t('Payment not completed')),
        t(isPending
          ? t('Do not send it again. Open Home and refresh Recent activity to check the final result.')
          : friendlyPaymentMessage(cause, 'Bitcoin')),
      );
      await notifyPaymentHaptics(Haptics.NotificationFeedbackType.Error);
    } finally {
      paymentInFlight.current = false;
      setLoading(false);
    }
  }

  async function executeOcpPayment() {
    if (!ocpState || !selectedOcpOption) return;
    setLoading(true);
    try {
      const payload = await fetchOcpExecutionPayload(
        ocpState.callbackUrl,
        ocpState.quote,
        selectedOcpOption,
      );
      if (!sparkWallet) throw new Error('Spark wallet is not ready.');
      await prepareLightningInvoice(
        payload.pr,
        payload.amount,
        ocpState.quote.merchantName || t('Merchant payment'),
      );
      setOcpState(null);
    } catch (cause) {
      Alert.alert(t('Could not prepare payment'), t(messageOf(cause)));
    } finally {
      setLoading(false);
    }
  }

  const reset = useCallback(() => {
    setDestination('');
    setAmountInput('');
    setAmountRequirement(null);
    setLightningResult(null);
    setPendingLightning(null);
    setPendingHedera(null);
    setHederaResult(null);
    setOcpState(null);
    setSelectedOcpOption(null);
    setPendingEId(null);
    setEIdSessionId(null);
    setEIdDemo(false);
    setSourceSelected(false);
    setSource('spark');
    setAdvancedExpanded(false);
    waitingForEId.current = false;
  }, []);

  useFocusEffect(useCallback(() => reset, [reset]));

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // A submitted payment must finish or become pending before leaving its review.
      if (loading || paymentInFlight.current) return true;
      if (pendingHedera) { setPendingHedera(null); return true; }
      if (pendingLightning) { setPendingLightning(null); return true; }
      if (ocpState || pendingEId || hederaResult || lightningResult || sourceSelected) {
        reset();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [loading, pendingHedera, pendingLightning, ocpState, pendingEId, hederaResult, lightningResult, sourceSelected, reset]));

  useFocusEffect(useCallback(() => {
    if (!walletReady || typeof scanResultKey !== 'string' || consumedScanRequest.current === scanResultKey) return;
    consumedScanRequest.current = scanResultKey;
    const value = paymentScanInbox.take(scanResultKey);
    if (!value) return;
    const scannedSource = inferPaymentSourceFromRequest(value, 'spark');
    setDestination(value);
    setSource(scannedSource);
    setSourceSelected(true);
    setAmountInput('');
    setAmountRequirement(null);
    if (scannedSource === 'hedera' || sparkWallet) void handleDestination(value, scannedSource);
  }, [handleDestination, scanResultKey, sparkWallet, walletReady]));

  if (hederaResult) {
    return (
      <HederaSuccessView
        result={hederaResult}
        onOpenHashscan={() => {
          void openHederaExplorerUrl(hederaResult.hashscanUrl).catch(cause =>
            Alert.alert(t('Could not open HashScan'), t(messageOf(cause))),
          );
        }}
        onOpenContract={
          hederaResult.contractHashscanUrl
            ? () => {
                void openHederaExplorerUrl(hederaResult.contractHashscanUrl!).catch(cause =>
                  Alert.alert(t('Could not open HashScan'), t(messageOf(cause))),
                );
              }
            : undefined
        }
        onDashboard={() => router.replace('/(tabs)')}
        onReset={reset}
      />
    );
  }

  if (pendingHedera && hederaAccount) {
    return (
      <HederaReviewView
        payment={pendingHedera}
        sourceAccountId={hederaAccount.accountId}
        loading={loading}
        onConfirm={() => void executeHederaPayment()}
        onCancel={() => setPendingHedera(null)}
      />
    );
  }

  if (pendingLightning) {
    return (
      <LightningReviewView
        payment={pendingLightning}
        loading={loading}
        onConfirm={() => void executeLightningPayment()}
        onCancel={() => setPendingLightning(null)}
      />
    );
  }

  if (lightningResult) {
    return (
      <LightningSuccessView
        amountSats={lightningResult.amountSats}
        reference={lightningResult.reference}
        onDashboard={() => router.replace('/(tabs)')}
        onReset={reset}
      />
    );
  }

  if (pendingEId) {
    return (
      <IdentityRequiredView
        demo={eIdDemo}
        loading={loading}
        onBegin={() => void beginEIdVerification()}
        onCancel={reset}
      />
    );
  }

  if (ocpState) {
    return (
      <OcpQuoteView
        state={ocpState}
        selected={selectedOcpOption}
        loading={loading}
        onSelect={setSelectedOcpOption}
        onExecute={() => void executeOcpPayment()}
        onCancel={() => {
          setOcpState(null);
          setSelectedOcpOption(null);
        }}
      />
    );
  }

  return (
    <PaymentForm
      destination={destination}
      amountInput={amountInput}
      amountRequirement={amountRequirement}
      currency={currency}
      source={source}
      sourceSelected={sourceSelected}
      advancedExpanded={advancedExpanded}
      onAdvancedChange={setAdvancedExpanded}
      balances={balances}
      balanceError={balanceError}
      balanceLoading={{ spark: balanceStates.spark.status === 'loading', hedera: balanceStates.hedera.status === 'loading' }}
      loading={loading}
      walletReady={walletReady}
      onDestinationChange={value => {
        setDestination(value);
        setAmountRequirement(null);
      }}
      onAmountChange={setAmountInput}
      onCurrencyChange={setCurrency}
      onSourceChange={nextSource => {
        setSource(nextSource);
        setAdvancedExpanded(false);
        setSourceSelected(true);
        setDestination('');
        setAmountInput('');
        setAmountRequirement(null);
      }}
      onChangeSource={() => {
        setSourceSelected(false);
        setSource('spark');
        setAdvancedExpanded(false);
        setDestination('');
        setAmountInput('');
        setAmountRequirement(null);
      }}
      onScan={() => router.push('/scan')}
      onReview={() => void handleDestination()}
    />
  );
}
