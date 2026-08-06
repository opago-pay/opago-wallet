import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { addTransaction } from '@/lib/database';
import { AtomiqExecutionError, getAtomiqQuote, executeAtomiqQuote } from '@/lib/atomiq';
import { fetchInvoiceFromLNURLP, LNURLPResponse, resolveLightningAddress, resolveLNURL } from '@/lib/lnurl-safe';
import { fetchOcpExecutionPayload, fetchOcpOptions, OcpOption, OcpResponse, resolveOcpUrl } from '@/lib/ocp-safe';
import { normalizeLightningInput, isBolt11Invoice } from '@/lib/lightning';
import { paySparkInvoice } from '@/lib/payments';
import { getSolanaBalances, sendSolanaAsset } from '@/lib/solana';
import { startEIdSession, waitForVerifiedEId } from '@/lib/eid';
import { appConfig } from '@/lib/config';
import { sendStyles as styles } from '../send-styles';

type Source = 'spark' | 'solana' | 'usdc';
type Currency = 'SAT' | 'EUR';
interface PendingEId { lnurl: LNURLPResponse; amountSats: number }
interface OcpState { callbackUrl: string; quote: OcpResponse }
interface BridgeQuote {
  swap: any;
  signer: any;
  amountSats: number;
  sourceAsset: 'SOL' | 'USDC';
  sourceCost: number;
  expiresAt: number;
}

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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [destination, setDestination] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<Currency>('SAT');
  const [source, setSource] = useState<Source>('spark');
  const [balances, setBalances] = useState({ spark: 0, sol: 0, usdc: 0 });
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

  const refreshBalances = useCallback(async () => {
    if (!walletReady) return;
    try {
      if (sparkWallet) {
        const balance = await sparkWallet.getBalance();
        const spark = (Number(balance.balance) || 0) + (Number(balance.satsBalance?.incoming) || 0);
        setBalances(current => ({ ...current, spark }));
      }
      if (solanaKeypair) {
        const solana = await getSolanaBalances(solanaKeypair.publicKey);
        setBalances(current => ({ ...current, ...solana }));
      }
    } catch {
      // Balance errors do not authorize a payment and are retried on the next focus.
    }
  }, [solanaKeypair, sparkWallet, walletReady]);

  useEffect(() => { void refreshBalances(); }, [refreshBalances]);

  const amountAsSats = useCallback(() => {
    if (!amountInput.trim()) return 0;
    const value = Number(amountInput.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a positive amount.');
    if (currency === 'SAT') {
      if (!Number.isInteger(value)) throw new Error('Satoshi amounts must be whole numbers.');
      return value;
    }
    if (rates.btcToEur <= 0) throw new Error('The EUR exchange rate is unavailable.');
    const sats = Math.floor((value / rates.btcToEur) * 1e8);
    if (sats <= 0) throw new Error('The converted amount is below one satoshi.');
    return sats;
  }, [amountInput, currency, rates.btcToEur]);

  function resolveLNURLAmount(info: LNURLPResponse, requested: number) {
    const min = Math.ceil(info.minSendable / 1000);
    const max = Math.floor(info.maxSendable / 1000);
    const amount = requested > 0 ? requested : min === max ? min : 0;
    if (amount <= 0) throw new Error('This LNURL requires an amount.');
    if (amount < min || amount > max) throw new Error('Amount must be between ' + min + ' and ' + max + ' SAT.');
    return amount;
  }

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
    if (!Number.isFinite(sourceCost) || sourceCost <= 0) throw new Error('Atomiq returned an invalid source amount.');
    const expiresAt = Number(swap.getQuoteExpiry?.());
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('Atomiq quote is already expired.');
    setBridgeQuote({ swap, signer: solanaSigner, amountSats, sourceAsset, sourceCost, expiresAt });
  }, [solanaKeypair, source, sparkWallet]);

  const finishEIdPayment = useCallback(async () => {
    if (!pendingEId || !eIdSessionId || completingEId.current) return;
    completingEId.current = true;
    waitingForEId.current = false;
    setLoading(true);
    try {
      const payerData = await waitForVerifiedEId(eIdSessionId);
      const invoice = await fetchInvoiceFromLNURLP(pendingEId.lnurl.callback, pendingEId.amountSats, payerData);
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
    return () => { appSub.remove(); linkSub.remove(); };
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
      if (session.demo) Alert.alert('Demo identity session', 'This is explicitly not a legal eID verification.');
      const clientUrl = 'eid://127.0.0.1:24727/eID-Client?tcTokenURL=' + encodeURIComponent(session.tcTokenURL);
      if (Platform.OS === 'android') {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: clientUrl, flags: 268435456 });
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
    if (!raw) return Alert.alert('Missing destination', 'Enter or scan a payment destination.');
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
      const requested = amountAsSats();
      let effectiveAmount = requested;
      let invoice = normalized;
      if (normalized.includes('@')) {
        const info = await resolveLightningAddress(normalized);
        effectiveAmount = resolveLNURLAmount(info, requested);
        if (info.compliance?.isSubjectToTravelRule && info.payerData?.compliance?.mandatory) {
          setPendingEId({ lnurl: info, amountSats: effectiveAmount });
          return;
        }
        invoice = await fetchInvoiceFromLNURLP(info.callback, effectiveAmount);
      } else if (/^lnurl1/i.test(normalized)) {
        const info = await resolveLNURL(normalized);
        effectiveAmount = resolveLNURLAmount(info, requested);
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
      return Alert.alert('Quote expired', 'Request a new quote.');
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
        txId: result.txId, reference: result.sourceTxId || result.txId, status: 'confirmed',
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
      const payload = await fetchOcpExecutionPayload(ocpState.callbackUrl, ocpState.quote, selectedOcpOption);
      if (payload.type === 'lightning') {
        if (!sparkWallet) throw new Error('Spark wallet is not ready.');
        const payment = await paySparkInvoice(sparkWallet, payload.pr, payload.amount);
        await addTransaction('outgoing', payment.amountSats, 'SAT', {
          txId: payment.reference, reference: payment.reference, status: 'confirmed',
        });
        setSuccessProof(payment.proof);
      } else {
        if (!solanaKeypair) throw new Error('Solana signer is not ready.');
        const approved = await confirmPayment(
          'Send ' + payload.amount + ' ' + payload.asset + ' to ' + payload.destination.slice(0, 8) + '...?',
        );
        if (!approved) return;
        const signature = await sendSolanaAsset({
          keypair: solanaKeypair,
          destination: payload.destination,
          amount: payload.amount,
          asset: payload.asset,
        });
        await addTransaction('outgoing', payload.amount, payload.asset, {
          txId: signature, reference: 'ocp:' + ocpState.quote.quoteId, status: 'confirmed',
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
    if (Platform.OS === 'web') return Alert.alert('Camera unavailable', 'Use a native build.');
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

  if (isScanning) return (
    <View style={styles.camera}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          setIsScanning(false);
          setDestination(data);
          void handleDestination(data);
        }}
      />
      <TouchableOpacity style={styles.cameraClose} onPress={() => setIsScanning(false)}>
        <Text style={styles.cameraCloseText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  if (successProof) return (
    <View style={[styles.container, styles.centered]}>
      <View style={styles.successCircle}><Text style={styles.checkmark}>OK</Text></View>
      <Text style={styles.successTitle}>Payment confirmed</Text>
      <Text style={styles.subtitle}>The payment was completed successfully.</Text>
      <View style={styles.proofBox}><Text style={styles.proofText}>{successProof}</Text></View>
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.buttonText}>Return to dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={reset}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Send another</Text>
      </TouchableOpacity>
    </View>
  );

  if (pendingEId) return (
    <View style={[styles.container, styles.centered]}>
      <Ionicons name="id-card-outline" size={76} color="#ffb000" />
      <Text style={[styles.quoteTitle, { marginTop: 24 }]}>Identity required</Text>
      <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 24 }]}>
        Verified payer data is required before requesting the invoice.
      </Text>
      {eIdDemo && <View style={styles.banner}><Text style={styles.bannerText}>Demo mode - not legal eID verification</Text></View>}
      <TouchableOpacity style={[styles.button, { width: '100%' }]} onPress={() => void beginEIdVerification()} disabled={loading}>
        {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Open AusweisApp</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={reset}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  if (bridgeQuote) return (
    <View style={[styles.container, styles.centered]}>
      <Text style={styles.quoteTitle}>Review bridge quote</Text>
      <View style={styles.quoteBox}>
        <View style={styles.quoteRow}><Text style={styles.quoteLabel}>Lightning</Text><Text style={styles.quoteValue}>{bridgeQuote.amountSats} SAT</Text></View>
        <View style={styles.quoteRow}><Text style={styles.quoteLabel}>Source cost</Text><Text style={styles.quoteValue}>{bridgeQuote.sourceCost.toFixed(6)} {bridgeQuote.sourceAsset}</Text></View>
      </View>
      <TouchableOpacity style={styles.button} onPress={() => void confirmBridge()} disabled={loading}>
        {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Confirm bridge</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setBridgeQuote(null)}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  if (ocpState) return (
    <View style={styles.container}>
      <Text style={styles.quoteTitle}>{ocpState.quote.merchantName}</Text>
      <Text style={styles.subtitle}>Total: {ocpState.quote.fiatAmount} {ocpState.quote.fiatCurrency}</Text>
      <View style={{ marginTop: 24 }}>
        {ocpState.quote.transferAmounts.map(option => (
          <TouchableOpacity
            key={option.method + ':' + option.asset}
            style={[styles.option, selectedOcpOption === option && styles.optionActive]}
            onPress={() => setSelectedOcpOption(option)}
          >
            <View><Text style={styles.optionTitle}>{option.chain} {option.asset}</Text><Text style={styles.optionMeta}>Fee: {option.fee}</Text></View>
            <Text style={styles.optionTitle}>{option.amount}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={[styles.button, !selectedOcpOption && { opacity: 0.5 }]} onPress={() => void executeOcpPayment()} disabled={loading || !selectedOcpOption}>
        {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Review and pay</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setOcpState(null)}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Send and bridge</Text>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} />
      </View>
      {!appConfig.isMainnet && <View style={styles.banner}><Text style={styles.bannerText}>Safe development mode: real mainnet payments and Atomiq swaps are blocked.</Text></View>}
      <View style={styles.card}>
        <View style={[styles.row, { alignItems: 'center' }]}>
          <TextInput
            style={[styles.input, styles.destinationInput, { flex: 1 }]}
            placeholder="BOLT11, Lightning Address or LNURL"
            placeholderTextColor="#666"
            value={destination}
            onChangeText={setDestination}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <TouchableOpacity style={styles.scanButton} onPress={() => void openScanner()}><Text style={styles.scanText}>Scan</Text></TouchableOpacity>
        </View>
        <Text style={styles.label}>Amount (optional for fixed invoices)</Text>
        <TextInput style={styles.input} placeholder={currency === 'SAT' ? 'Satoshis' : 'Euro'} placeholderTextColor="#666" value={amountInput} onChangeText={setAmountInput} keyboardType="decimal-pad" />
        <View style={styles.row}>
          {(['SAT', 'EUR'] as Currency[]).map(item => (
            <TouchableOpacity key={item} style={[styles.selector, currency === item && styles.selectorActive]} onPress={() => setCurrency(item)}>
              <Text style={[styles.selectorText, currency === item && styles.selectorTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Pay from</Text>
        <View style={styles.row}>
          {([
            ['spark', 'Lightning', balances.spark + ' SAT'],
            ['solana', 'SOL', balances.sol.toFixed(4)],
            ['usdc', 'USDC', balances.usdc.toFixed(2)],
          ] as [Source, string, string][]).map(([key, label, balance]) => (
            <TouchableOpacity key={key} style={[styles.selector, source === key && styles.selectorActive]} onPress={() => setSource(key)}>
              <Text style={[styles.selectorText, source === key && styles.selectorTextActive]}>{label}</Text>
              <Text style={styles.optionMeta}>{balance}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.button} onPress={() => void handleDestination()} disabled={loading || !walletReady}>
          {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Review payment</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
