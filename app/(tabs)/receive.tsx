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
import {
  findNewConfirmedIncomingHederaTransaction,
  loadHederaHistory,
} from '@/lib/hedera/account';
import {
  buildHederaReceiveRequest,
  parseHederaTestTransferTinybars,
} from '@/lib/hedera/payments';
import { decodeLightningInvoice } from '@/lib/lightning';
import { sparkTransferMatchesInvoice } from '@/lib/payments';
import {
  findConfirmedIncomingSol,
  getSolanaReceiveSnapshot,
  SolanaReceiveSnapshot,
} from '@/lib/solana';
import { sendStyles as styles } from '@/styles/send-styles';

type ReceiveNetwork = 'lightning' | 'solana' | 'hedera';

export default function ReceiveScreen() {
  const router = useRouter();
  const rates = useExchangeRates();
  const {
    sparkWallet,
    walletReady,
    loadOrGenerateWallet,
    solanaKeypair,
    hederaAccount,
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
  const solanaSnapshot = useRef<SolanaReceiveSnapshot | null>(null);
  const [solanaReady, setSolanaReady] = useState(false);
  const hederaKnownTransactions = useRef<Set<string> | null>(null);
  const hederaExpectedAmountTinybars = useRef<bigint | null>(null);
  const [hederaReady, setHederaReady] = useState(false);
  const [hederaRequest, setHederaRequest] = useState<string | null>(null);

  useEffect(() => {
    if (!walletReady) void loadOrGenerateWallet();
  }, [loadOrGenerateWallet, walletReady]);

  const markPaid = useCallback(async (
    amount: number,
    asset: 'SAT' | 'SOL',
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

  useEffect(() => {
    if (network !== 'hedera' || !walletReady || isPaid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function initializeAndPoll() {
      const account = await refreshHederaAccount();
      if (!account) throw new Error('No Hedera testnet account exists for this wallet.');
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
          const description = incoming.amountHbar + ' HBAR confirmed on testnet.';
          setReceivedDescription(description);
          setIsPaid(true);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          try {
            const permissions = await Notifications.getPermissionsAsync();
            if (permissions.granted) {
              await Notifications.scheduleNotificationAsync({
                content: { title: 'Testnet HBAR received', body: description },
                trigger: null,
              });
            }
          } catch {
            // Notification availability must not change a confirmed payment state.
          }
          return;
        }
      }
      if (!cancelled) timer = setTimeout(initializeAndPoll, 8_000);
    }

    void initializeAndPoll().catch(() => {
      if (!cancelled) timer = setTimeout(initializeAndPoll, 8_000);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isPaid, network, refreshHederaAccount, walletReady]);

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
      if (!account) throw new Error('No Hedera testnet account exists for this wallet.');
      const amountTinybars = amountInput.trim()
        ? parseHederaTestTransferTinybars(amountInput)
        : null;
      hederaExpectedAmountTinybars.current = amountTinybars;
      setHederaRequest(buildHederaReceiveRequest(account.accountId, amountTinybars));
    } catch (cause) {
      Alert.alert(
        'Could not create HBAR request',
        cause instanceof Error ? cause.message : 'Hedera testnet is unavailable.',
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
    solanaSnapshot.current = null;
    setSolanaReady(false);
    hederaKnownTransactions.current = null;
    hederaExpectedAmountTinybars.current = null;
    setHederaReady(false);
    setHederaRequest(null);
  }, []);

  useFocusEffect(useCallback(() => reset, [reset]));

  async function copy(value: string) {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', 'Payment destination copied to clipboard.');
  }

  if (isPaid) return (
    <View style={[styles.container, styles.centered]}>
      {network === 'hedera' && (
        <View style={[styles.testnetBanner, { width: '100%' }]}>
          <Text style={styles.testnetTitle}>HEDERA TESTNET</Text>
        </View>
      )}
      <View style={styles.successCircle}><Text style={styles.checkmark}>OK</Text></View>
      <Text style={styles.successTitle}>Funds confirmed</Text>
      <Text style={styles.subtitle}>{receivedDescription || 'The exact incoming transaction was verified.'}</Text>
      <TouchableOpacity style={[styles.button, { marginTop: 24 }]} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.buttonText}>Return to dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={reset}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Receive another</Text>
      </TouchableOpacity>
    </View>
  );

  const solanaAddress = solanaKeypair?.publicKey.toBase58() || '';
  const qrValue =
    network === 'solana'
      ? solanaAddress && solanaReady
        ? 'solana:' + solanaAddress
        : ''
      : network === 'hedera'
        ? hederaRequest || ''
        : invoice || '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Receive</Text>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} />
      </View>
      {network === 'hedera' && (
        <View style={styles.testnetBanner}>
          <Text style={styles.testnetTitle}>HEDERA TESTNET</Text>
          <Text style={styles.testnetText}>Receive test HBAR only.</Text>
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.label}>Network</Text>
        <View style={styles.row}>
          {(['lightning', 'solana', 'hedera'] as ReceiveNetwork[]).map(item => (
            <TouchableOpacity
              key={item}
              style={[styles.selector, network === item && styles.selectorActive]}
              onPress={() => {
                reset();
                setNetwork(item);
                setAmountInput(item === 'hedera' ? '' : '10');
                setIsEur(false);
              }}
            >
              <Text style={[styles.selectorText, network === item && styles.selectorTextActive]}>
                {item === 'lightning' ? 'Lightning' : item === 'solana' ? 'Solana' : 'Hedera'}
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

        {network === 'hedera' && (
          <>
            {!hederaReady ? (
              <ActivityIndicator color="#ffb000" />
            ) : hederaAccount ? (
              <>
                <Text style={styles.label}>Account ID</Text>
                <TouchableOpacity style={styles.proofBox} onPress={() => void copy(hederaAccount.accountId)}>
                  <Text style={styles.proofText} selectable>{hederaAccount.accountId}</Text>
                  <Text style={styles.testnetText}>Tap to copy</Text>
                </TouchableOpacity>
                {!hederaRequest && (
                  <>
                    <Text style={styles.label}>Amount in HBAR (optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={amountInput}
                      onChangeText={setAmountInput}
                      keyboardType="decimal-pad"
                      placeholder="Leave empty for an open request"
                      placeholderTextColor="#666"
                    />
                    <TouchableOpacity style={styles.button} onPress={() => void prepareHederaRequest()} disabled={loading}>
                      {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Create HBAR receive QR</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.errorText}>No Hedera testnet account was found.</Text>
            )}
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
