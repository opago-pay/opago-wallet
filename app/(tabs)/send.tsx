import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import { fetchInvoiceFromLNURLP, resolveLightningAddress, resolveLNURL } from '@/lib/lnurl-safe';
import { fetchOcpExecutionPayload, fetchOcpOptions, resolveOcpUrl } from '@/lib/ocp-safe';
import { normalizeLightningInput, isBolt11Invoice } from '@/lib/lightning';
import {
  inferPaymentSourceFromRequest,
  parsePaymentAmount,
  resolveLnurlAmount,
} from '@/lib/payment-input';
import {
  LightningPaymentPendingError,
  payPreparedSparkPayment,
  prepareSparkPayment,
  type SparkPaymentResult,
} from '@/lib/payments';
import { authorizePayment } from '@/lib/payment-authorization';
import { lightningPaymentLifecycle } from '@/lib/lightning/reconcile-native';
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
  getHederaPaymentFeeCeilingTinybars,
  HEDERA_NETWORK_LABEL,
} from '@/lib/hedera/config';
import {
  parseHederaCheckoutRequest,
  verifyHederaCheckoutRequest,
} from '@/lib/hedera/checkout';
import { openHederaExplorerUrl } from '@/lib/hedera/explorer-native';
import {
  formatTinybars,
  HederaPaymentPendingError,
  parseHederaPaymentRequest,
  parseHederaTransferTinybars,
  type HederaTransferResult,
} from '@/lib/hedera/payments';
import {
  IdentityRequiredView,
  OcpQuoteView,
  ScannerView,
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

const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : 'Payment failed.';

function friendlyPaymentMessage(cause: unknown, asset = 'payment'): string {
  const message = messageOf(cause);
  const normalized = message.toLowerCase();
  if (normalized.includes('insufficient') || normalized.includes('not enough')) {
    return `There is not enough ${asset} to cover this payment and its network fee.`;
  }
  if (normalized.includes('expired')) {
    return 'This payment request has expired. Ask for a new QR code.';
  }
  if (normalized.includes('does not match') || normalized.includes('wrong amount')) {
    return 'The entered amount is different from the payment request. Check it and try again.';
  }
  if (normalized.includes('no ') && normalized.includes('account')) {
    return `Your ${asset} account is not ready yet. Open Request to finish setting it up.`;
  }
  if (normalized.includes('contract_revert') || normalized.includes('rejected')) {
    return 'The payment was rejected. No successful payment was recorded.';
  }
  if (normalized.includes('cancelled') || normalized.includes('canceled')) {
    return 'Payment cancelled. Nothing was sent.';
  }
  if (normalized.includes('unavailable') || normalized.includes('timeout')) {
    return 'The payment network is taking too long to respond. Please try again in a moment.';
  }
  return 'We could not prepare this payment. Check the recipient and amount, then try again.';
}

function isExpectedEIdDeepLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'opagowallet:' && url.hostname === 'eid-success';
  } catch {
    return false;
  }
}

export default function SendScreen() {
  const router = useRouter();
  const { hederaRequest, hederaRequestKey } = useLocalSearchParams<{
    hederaRequest?: string | string[];
    hederaRequestKey?: string | string[];
  }>();
  const rates = useExchangeRates();
  const {
    sparkWallet,
    walletReady,
    hederaPublicKey,
    hederaAccount,
    loadOrGenerateWallet,
    refreshHederaAccount,
    sendHederaPayment,
  } = useWalletAuth();
  const { balances, balanceError } = useWalletBalances({
    walletReady,
    sparkWallet,
    refreshHederaAccount,
  });
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [destination, setDestination] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<PaymentCurrency>('SAT');
  const [source, setSource] = useState<PaymentSource>('spark');
  const [sourceSelected, setSourceSelected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
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
  const consumedHederaRequestKey = useRef<string | null>(null);

  useEffect(() => {
    if (!walletReady) void loadOrGenerateWallet();
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
    setPendingHedera(null);
    setHederaResult(null);
  }, [hederaRequest, hederaRequestKey]);

  const prepareLightningInvoice = useCallback(async (
    invoice: string,
    requestedAmount?: number,
    recipientLabel = 'Lightning payment request',
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
      await prepareLightningInvoice(invoice, pendingEId.amountSats, 'Verified payment request');
      setPendingEId(null);
      setEIdSessionId(null);
    } catch (cause) {
      Alert.alert('Identity verification failed', messageOf(cause));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
        Alert.alert('Demo identity session', 'This is explicitly not a legal eID verification.');
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
      Alert.alert('Could not start AusweisApp', messageOf(cause));
    } finally {
      setLoading(false);
    }
  }

  async function handleDestination(
    scannedValue?: string,
    sourceOverride?: PaymentSource,
  ) {
    const raw = (scannedValue ?? destination).trim();
    const activeSource = sourceOverride || source;
    if (!raw) {
      Alert.alert('Who are you paying?', 'Scan a payment QR code or enter the recipient.');
      return;
    }
    setLoading(true);
    try {
      if (activeSource === 'hedera') {
        const checkoutRequest = parseHederaCheckoutRequest(raw);
        const directRequest = checkoutRequest ? null : parseHederaPaymentRequest(raw);
        const enteredAmount = amountInput.trim()
          ? parseHederaTransferTinybars(amountInput)
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
          throw new Error('Enter an HBAR amount or scan a request that includes one.');
        }
        const sourceAccount = hederaAccount || await refreshHederaAccount();
        if (!sourceAccount) {
          throw new Error('No ' + HEDERA_NETWORK_LABEL + ' account exists for this recovery phrase.');
        }
        const feeCeilingTinybars = getHederaPaymentFeeCeilingTinybars(
          checkoutRequest ? 'checkout' : 'direct',
        );
        if (amountTinybars + feeCeilingTinybars > sourceAccount.balanceTinybars) {
          throw new Error('Insufficient HBAR balance including the maximum transaction fee.');
        }
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
      const normalized = normalizeLightningInput(raw);
      const requested = parsePaymentAmount(amountInput, currency, rates.btcToEur);
      let effectiveAmount = requested;
      let invoice = normalized;
      if (normalized.includes('@')) {
        const info = await resolveLightningAddress(normalized);
        effectiveAmount = resolveLnurlAmount(info.minSendable, info.maxSendable, requested);
        if (info.compliance?.isSubjectToTravelRule && info.payerData?.compliance?.mandatory) {
          setPendingEId({ lnurl: info, amountSats: effectiveAmount });
          return;
        }
        invoice = await fetchInvoiceFromLNURLP(info.callback, effectiveAmount);
      } else if (/^lnurl1/i.test(normalized)) {
        const info = await resolveLNURL(normalized);
        effectiveAmount = resolveLnurlAmount(info.minSendable, info.maxSendable, requested);
        if (info.compliance?.isSubjectToTravelRule && info.payerData?.compliance?.mandatory) {
          setPendingEId({ lnurl: info, amountSats: effectiveAmount });
          return;
        }
        invoice = await fetchInvoiceFromLNURLP(info.callback, effectiveAmount);
      } else if (!isBolt11Invoice(normalized)) {
        throw new Error('Unsupported payment destination.');
      }
      await prepareLightningInvoice(
        invoice,
        effectiveAmount > 0 ? effectiveAmount : undefined,
        normalized.includes('@') ? normalized : 'Lightning payment request',
      );
    } catch (cause) {
      Alert.alert(
        'Check this payment',
        friendlyPaymentMessage(
          cause,
          activeSource === 'hedera' ? 'HBAR' : 'Bitcoin',
        ),
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function executeHederaPayment() {
    if (!pendingHedera) return;
    setLoading(true);
    try {
      const result = await sendHederaPayment({
        recipientAccountId: pendingHedera.recipientAccountId,
        amountTinybars: pendingHedera.amountTinybars,
        checkoutRequest: pendingHedera.checkoutRequest,
      });
      setPendingHedera(null);
      setHederaResult(result);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      const isPending = cause instanceof HederaPaymentPendingError;
      if (isPending) setPendingHedera(null);
      Alert.alert(
        isPending ? 'Payment is still processing' : 'Payment not completed',
        isPending
          ? 'Do not send it again. Open Home and refresh Recent activity to check the final result.'
          : friendlyPaymentMessage(cause, 'HBAR'),
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function executeLightningPayment() {
    if (!pendingLightning || !sparkWallet) return;
    setLoading(true);
    try {
      await authorizePayment();
      const result = await payPreparedSparkPayment(
        sparkWallet,
        pendingLightning,
        lightningPaymentLifecycle,
      );
      setPendingLightning(null);
      setLightningResult(result);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Haptics are optional and cannot invalidate a proof-backed payment.
      }
    } catch (cause) {
      const isPending = cause instanceof LightningPaymentPendingError;
      if (isPending) setPendingLightning(null);
      Alert.alert(
        isPending ? 'Payment is still processing' : 'Payment not completed',
        isPending
          ? 'Do not send it again. Open Home and refresh Recent activity to check the final result.'
          : friendlyPaymentMessage(cause, 'Bitcoin'),
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
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
        ocpState.quote.merchantName || 'Merchant payment',
      );
      setOcpState(null);
    } catch (cause) {
      Alert.alert('Could not prepare payment', messageOf(cause));
    } finally {
      setLoading(false);
    }
  }

  async function openScanner() {
    if (Platform.OS === 'web') {
      Alert.alert('Camera unavailable', 'Use a native build.');
      return;
    }
    if (!cameraPermission?.granted && !(await requestCameraPermission()).granted) return;
    setIsScanning(true);
  }

  const reset = useCallback(() => {
    setDestination('');
    setAmountInput('');
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
    waitingForEId.current = false;
  }, []);

  useFocusEffect(useCallback(() => reset, [reset]));

  if (isScanning) {
    return (
      <ScannerView
        onScanned={value => {
          setIsScanning(false);
          setDestination(value);
          const scannedSource = inferPaymentSourceFromRequest(value, source);
          setSourceSelected(true);
          if (scannedSource !== source) {
            setSource(scannedSource);
            setAmountInput('');
          }
          void handleDestination(value, scannedSource);
        }}
        onCancel={() => setIsScanning(false)}
      />
    );
  }

  if (hederaResult) {
    return (
      <HederaSuccessView
        result={hederaResult}
        onOpenHashscan={() => {
          void openHederaExplorerUrl(hederaResult.hashscanUrl).catch(cause =>
            Alert.alert('Could not open HashScan', messageOf(cause)),
          );
        }}
        onOpenContract={
          hederaResult.contractHashscanUrl
            ? () => {
                void openHederaExplorerUrl(hederaResult.contractHashscanUrl!).catch(cause =>
                  Alert.alert('Could not open HashScan', messageOf(cause)),
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
      currency={currency}
      source={source}
      sourceSelected={sourceSelected}
      balances={balances}
      balanceError={balanceError}
      loading={loading}
      walletReady={walletReady}
      onDestinationChange={setDestination}
      onAmountChange={setAmountInput}
      onCurrencyChange={setCurrency}
      onSourceChange={nextSource => {
        setSource(nextSource);
        setSourceSelected(true);
        setDestination('');
        setAmountInput('');
      }}
      onChangeSource={() => {
        setSourceSelected(false);
        setDestination('');
        setAmountInput('');
      }}
      onScan={() => void openScanner()}
      onReview={() => void handleDestination()}
    />
  );
}
