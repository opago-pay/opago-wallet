import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { addTransaction } from '@/lib/database';
import { decodeLightningInvoice } from '@/lib/lightning';
import { sparkTransferMatchesInvoice } from '@/lib/payments';
import {
  findConfirmedIncomingSol,
  getSolanaReceiveSnapshot,
  SolanaReceiveSnapshot,
} from '@/lib/solana';
import { sendStyles as styles } from '../send-styles';

type ReceiveNetwork = 'lightning' | 'solana';

export default function ReceiveScreen() {
  const router = useRouter();
  const rates = useExchangeRates();
  const { sparkWallet, walletReady, loadOrGenerateWallet, solanaKeypair } = useWalletAuth();
  const [network, setNetwork] = useState<ReceiveNetwork>('lightning');
  const [invoice, setInvoice] = useState<string | null>(null);
  const [invoicePaymentHash, setInvoicePaymentHash] = useState<string | null>(null);
  const [invoiceAmountSats, setInvoiceAmountSats] = useState(0);
  const [amountInput, setAmountInput] = useState('10');
  const [isEur, setIsEur] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const solanaSnapshot = useRef<SolanaReceiveSnapshot | null>(null);
  const [solanaReady, setSolanaReady] = useState(false);

  useEffect(() => {
    if (!walletReady) void loadOrGenerateWallet();
  }, [loadOrGenerateWallet, walletReady]);

  const markPaid = useCallback(async (amount: number, asset: 'SAT' | 'SOL', txId: string, reference = txId) => {
    await addTransaction('incoming', amount, asset, {
      txId,
      reference,
      status: 'confirmed',
    });
    setIsPaid(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Payment received', body: amount + ' ' + asset + ' confirmed.' },
      trigger: null,
    });
  }, []);

  useEffect(() => {
    if (!invoice || !invoicePaymentHash || !sparkWallet || isPaid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

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
      } catch {
        // Temporary network failures are retried without changing payment state.
      }
      if (!cancelled) timer = setTimeout(poll, 2_500);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [invoice, invoiceAmountSats, invoicePaymentHash, isPaid, markPaid, sparkWallet]);

  useEffect(() => {
    if (network !== 'solana' || !solanaKeypair || isPaid) return;
    const activeKeypair = solanaKeypair;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function initializeAndPoll() {
      if (!solanaSnapshot.current) {
        solanaSnapshot.current = await getSolanaReceiveSnapshot(activeKeypair.publicKey);
      }
      if (!cancelled) setSolanaReady(true);
      const incoming = await findConfirmedIncomingSol(
        activeKeypair.publicKey,
        solanaSnapshot.current.latestSignature,
      );
      if (incoming && !cancelled) {
        await markPaid(incoming.amountSol, 'SOL', incoming.signature);
        return;
      }
      if (!cancelled) timer = setTimeout(initializeAndPoll, 12_000);
    }

    void initializeAndPoll().catch(() => {
      if (!cancelled) timer = setTimeout(initializeAndPoll, 12_000);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isPaid, markPaid, network, solanaKeypair]);

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

  const reset = useCallback(() => {
    setInvoice(null);
    setInvoicePaymentHash(null);
    setInvoiceAmountSats(0);
    setIsPaid(false);
    solanaSnapshot.current = null;
  }, []);
    setSolanaReady(false);

  useFocusEffect(useCallback(() => reset, [reset]));

  async function copy(value: string) {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', 'Payment destination copied to clipboard.');
  }

  if (isPaid) return (
    <View style={[styles.container, styles.centered]}>
      <View style={styles.successCircle}><Text style={styles.checkmark}>OK</Text></View>
      <Text style={styles.successTitle}>Funds confirmed</Text>
      <Text style={styles.subtitle}>The exact incoming transaction was verified.</Text>
      <TouchableOpacity style={[styles.button, { marginTop: 24 }]} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.buttonText}>Return to dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={reset}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Receive another</Text>
      </TouchableOpacity>
    </View>
  );

  const solanaAddress = solanaKeypair?.publicKey.toBase58() || '';
  const qrValue = network === 'solana' ? (solanaAddress && solanaReady ? 'solana:' + solanaAddress : '') : invoice || '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Receive</Text>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} />
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Network</Text>
        <View style={styles.row}>
          {(['lightning', 'solana'] as ReceiveNetwork[]).map(item => (
            <TouchableOpacity
              key={item}
              style={[styles.selector, network === item && styles.selectorActive]}
              onPress={() => {
                reset();
                setNetwork(item);
              }}
            >
              <Text style={[styles.selectorText, network === item && styles.selectorTextActive]}>
                {item === 'lightning' ? 'Lightning' : 'Solana'}
              </Text>
            </TouchableOpacity>
          ))}
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
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsEur(value => !value)}>
              <Text style={styles.secondaryButtonText}>{isEur ? 'Entered in EUR' : 'Entered in SAT'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { marginTop: 18 }]} onPress={() => void generateInvoice()} disabled={loading || !walletReady}>
              {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Create 10-minute invoice</Text>}
            </TouchableOpacity>
          </>
        )}

        {qrValue && (
          <View style={{ alignItems: 'center', marginTop: 18 }}>
            <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16 }}>
              <QRCode value={qrValue} size={210} />
            </View>
            <Text style={[styles.proofText, { marginTop: 18 }]} numberOfLines={3}>{qrValue}</Text>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => void copy(qrValue)}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>Copy</Text>
            </TouchableOpacity>
          </View>
        )}

        {network === 'solana' && !solanaAddress && (
          <Text style={styles.errorText}>Solana wallet is not ready.</Text>
        )}
        {network === 'solana' && solanaAddress && !solanaReady && (
          <ActivityIndicator color="#ffb000" />
        )}
      </View>
    </View>
  );
}
