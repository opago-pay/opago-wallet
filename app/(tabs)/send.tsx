import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import { addTransaction } from '@/lib/database';
import { AtomiqExecutionError, getAtomiqQuote, executeAtomiqQuote } from '@/lib/atomiq';
import { fetchInvoiceFromLNURLP, resolveLightningAddress, resolveLNURL } from '@/lib/lnurl-safe';
import { fetchOcpExecutionPayload, fetchOcpOptions, resolveOcpUrl } from '@/lib/ocp-safe';
import { normalizeLightningInput, isBolt11Invoice } from '@/lib/lightning';
import { parsePaymentAmount, resolveLnurlAmount } from '@/lib/payment-input';
import { paySparkInvoice } from '@/lib/payments';
import { sendSolanaAsset } from '@/lib/solana';
import { startEIdSession, waitForVerifiedEId } from '@/lib/eid';
import { PaymentForm } from '@/components/send/payment-form';
import {
  BridgeQuoteView,
  IdentityRequiredView,
  OcpQuoteView,
  PaymentSuccessView,
  ScannerView,
} from '@/components/send/payment-state-views';
import type {
  BridgeQuote,
  OcpOption,
  OcpState,
  PaymentCurrency,
  PaymentSource,
  PendingEId,
} from '@/components/send/types';

const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : 'Payment failed.';

function confirmPayment(message: string): Promise<boolean> {
  return new Promise(resolve => Alert.alert('Confirm payment', message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Sign and send', onPress: () => resolve(true) },
  ]));
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
  const rates = useExchangeRates();
  const { sparkWallet, solanaKeypair, walletReady, loadOrGenerateWallet } = useWalletAuth();
  const { balances, balanceError } = useWalletBalances({
    walletReady,
    sparkWallet,
    solanaPublicKey: solanaKeypair?.publicKey || null,
  });
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [destination, setDestination] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<PaymentCurrency>('SAT');
  const [source, setSource] = useState<PaymentSource>('spark');
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [successProof, setSuccessProof] = useState<string | null>(null);
  const [ocpState, setOcpState] = useState<OcpState | null>(null);
  const [selectedOcpOption, setSelectedOcpOption] = useState<OcpOption | null>(null);
  const [bridgeQuote, setBridgeQuote] = useState<BridgeQuote | null>(null);
  const [pendingEId, setPendingEId] = useState<PendingEId | null>(null);
  const [eIdSessionId, setEIdSessionId] = useState<string | null>(null);
  const [eIdDemo, setEIdDemo] = useState(false);
  const waitingForEId = useRef(false);
  const completingEId = useRef(false);

  useEffect(() => {
    if (!walletReady) void loadOrGenerateWallet();
  }, [loadOrGenerateWallet, walletReady]);

  const executeInvoice = useCallback(async (invoice: string, requestedAmount?: number) => {
    if (source === 'spark') {
      if (!sparkWallet) throw new Error('Spark wallet is not ready.');
      const payment = await paySparkInvoice(sparkWallet, invoice, requestedAmount);
      await addTransaction('outgoing', payment.amountSats, 'SAT', {
        txId: payment.reference,
        reference: payment.reference,
        status: 'confirmed',
      });
      setSuccessProof(payment.proof);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    if (!solanaKeypair) throw new Error('Solana signer is not ready.');
    const sourceAsset = source === 'usdc' ? 'USDC' : 'SOL';
    const amountSats = requestedAmount || 0;
    const { swap, solanaSigner } = await getAtomiqQuote(solanaKeypair, invoice, amountSats, sourceAsset);
    const sourceCost = Number(swap.getInput()?.amount);
    if (!Number.isFinite(sourceCost) || sourceCost <= 0) {
      throw new Error('Atomiq returned an invalid source amount.');
    }
    const expiresAt = Number(swap.getQuoteExpiry?.());
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error('Atomiq quote is already expired.');
    }
    setBridgeQuote({ swap, signer: solanaSigner, amountSats, sourceAsset, sourceCost, expiresAt });
  }, [solanaKeypair, source, sparkWallet]);

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
      await executeInvoice(invoice, pendingEId.amountSats);
      setPendingEId(null);
      setEIdSessionId(null);
    } catch (cause) {
      Alert.alert('Identity verification failed', messageOf(cause));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      completingEId.current = false;
      setLoading(false);
    }
  }, [eIdSessionId, executeInvoice, pendingEId]);

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
        walletIdentifier: solanaKeypair?.publicKey.toBase58() || 'spark-wallet',
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

  async function handleDestination(scannedValue?: string) {
    const raw = (scannedValue ?? destination).trim();
    if (!raw) {
      Alert.alert('Missing destination', 'Enter or scan a payment destination.');
      return;
    }
    setLoading(true);
    try {
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
      await executeInvoice(invoice, effectiveAmount > 0 ? effectiveAmount : undefined);
    } catch (cause) {
      Alert.alert('Payment failed', messageOf(cause));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function confirmBridge() {
    if (!bridgeQuote) return;
    if (bridgeQuote.expiresAt <= Date.now()) {
      setBridgeQuote(null);
      Alert.alert('Quote expired', 'Request a new quote.');
      return;
    }
    const approved = await confirmPayment(
      'Spend ' + bridgeQuote.sourceCost.toFixed(6) + ' ' + bridgeQuote.sourceAsset +
      ' to pay ' + bridgeQuote.amountSats + ' SAT?',
    );
    if (!approved) return;
    setLoading(true);
    try {
      const result = await executeAtomiqQuote(bridgeQuote.swap, bridgeQuote.signer);
      await addTransaction('outgoing', bridgeQuote.sourceCost, bridgeQuote.sourceAsset, {
        txId: result.txId,
        reference: result.sourceTxId || result.txId,
        status: 'confirmed',
      });
      setBridgeQuote(null);
      setSuccessProof(result.txId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      if (cause instanceof AtomiqExecutionError && cause.sourceTxId) {
        setBridgeQuote(null);
        Alert.alert('Swap requires attention', messageOf(cause));
        await addTransaction('outgoing', bridgeQuote.sourceCost, bridgeQuote.sourceAsset, {
          txId: cause.sourceTxId,
          reference: cause.sourceTxId,
          status: 'action_required',
        });
      } else {
        Alert.alert('Bridge payment failed', messageOf(cause));
      }
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
      if (payload.type === 'lightning') {
        if (!sparkWallet) throw new Error('Spark wallet is not ready.');
        const payment = await paySparkInvoice(sparkWallet, payload.pr, payload.amount);
        await addTransaction('outgoing', payment.amountSats, 'SAT', {
          txId: payment.reference,
          reference: payment.reference,
          status: 'confirmed',
        });
        setSuccessProof(payment.proof);
      } else {
        if (!solanaKeypair) throw new Error('Solana signer is not ready.');
        const approved = await confirmPayment(
          'Send ' + payload.amount + ' ' + payload.asset +
          ' to ' + payload.destination.slice(0, 8) + '...?',
        );
        if (!approved) return;
        const signature = await sendSolanaAsset({
          keypair: solanaKeypair,
          destination: payload.destination,
          amount: payload.amount,
          asset: payload.asset,
        });
        await addTransaction('outgoing', payload.amount, payload.asset, {
          txId: signature,
          reference: 'ocp:' + ocpState.quote.quoteId,
          status: 'confirmed',
        });
        setSuccessProof(signature);
      }
      setOcpState(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      Alert.alert('OCP payment failed', messageOf(cause));
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
    setSuccessProof(null);
    setOcpState(null);
    setSelectedOcpOption(null);
    setBridgeQuote(null);
    setPendingEId(null);
    setEIdSessionId(null);
    setEIdDemo(false);
    waitingForEId.current = false;
  }, []);

  useFocusEffect(useCallback(() => reset, [reset]));

  if (isScanning) {
    return (
      <ScannerView
        onScanned={value => {
          setIsScanning(false);
          setDestination(value);
          void handleDestination(value);
        }}
        onCancel={() => setIsScanning(false)}
      />
    );
  }

  if (successProof) {
    return (
      <PaymentSuccessView
        proof={successProof}
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

  if (bridgeQuote) {
    return (
      <BridgeQuoteView
        quote={bridgeQuote}
        loading={loading}
        onConfirm={() => void confirmBridge()}
        onCancel={() => setBridgeQuote(null)}
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
      balances={balances}
      balanceError={balanceError}
      loading={loading}
      walletReady={walletReady}
      onDestinationChange={setDestination}
      onAmountChange={setAmountInput}
      onCurrencyChange={setCurrency}
      onSourceChange={setSource}
      onScan={() => void openScanner()}
      onReview={() => void handleDestination()}
    />
  );
}
