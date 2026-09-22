import { useRef, useState } from 'react';
import { Alert, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useLanguage } from '@/hooks/useLanguage';
import { useBitcoinOperations } from '@/hooks/useBitcoinOperations';
import { t } from '@/lib/i18n';
import { appConfig } from '@/lib/config';
import { walletSession } from '@/lib/wallet-session';
import { authorizePayment } from '@/lib/payment-authorization';
import { validateBitcoinAddress } from '@/lib/bitcoin/destination';
import { bitcoinScope, type OnchainWallet } from '@/lib/bitcoin/onchain';
import { prepareBitcoinDeposit, claimBitcoinDeposit, type BitcoinDepositQuote } from '@/lib/bitcoin/deposits';
import { bitcoinStore, bitcoinDepositWatch } from '@/lib/bitcoin/store-native';
import { withTimeout } from '@/lib/promise-timeout';
import { PaymentBackButton } from '@/components/send/payment-back-button';
import { BitcoinButton, BitcoinMoney, bitcoinStyles } from './payment-ui';

export function BitcoinDepositScreen({ wallet, onBack }: { wallet: OnchainWallet | null; onBack(): void }) {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [quote, setQuote] = useState<BitcoinDepositQuote | null>(null);
  const { operations, error, refresh } = useBitcoinOperations(wallet, true, true);
  const deposits = operations.filter(item => item.kind === 'deposit');
  async function run(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try { await work(); }
    catch { Alert.alert(t('Bitcoin deposit'), t('The deposit could not be updated. Your incoming Bitcoin remains tracked. Please check again.')); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function showAddress() {
    if (!wallet) return;
    const assertCurrent = walletSession.captureRuntime();
    const result = await withTimeout(wallet.getStaticDepositAddress(), 20_000, 'Bitcoin address unavailable.');
    assertCurrent();
    const scope = await bitcoinScope(wallet, appConfig.sparkNetwork);
    await bitcoinDepositWatch.enable(scope, assertCurrent);
    assertCurrent();
    setAddress(validateBitcoinAddress(result));
    refresh();
  }
  async function claim() {
    if (!quote || !wallet) return;
    const authorized = await authorizePayment();
    await claimBitcoinDeposit(wallet, bitcoinStore, quote, authorized);
    authorized();
    setQuote(null);
    refresh();
  }
  return <ScrollView style={bitcoinStyles.screen} contentContainerStyle={[bitcoinStyles.page, { paddingTop: insets.top + 12 }]}>
    <PaymentBackButton onPress={quote ? () => setQuote(null) : onBack} disabled={busy} label={t('Back')} />
    <Text style={bitcoinStyles.title}>{t(quote ? 'Review incoming Bitcoin' : address ? 'Your Bitcoin address' : 'Deposit from another app')}</Text>
    <Text style={bitcoinStyles.warning}>{t('Sender network: Bitcoin. Choose Bitcoin or BTC in the sending app.')}{!appConfig.isMainnet ? '\nREGTEST · ' + t('TEST MODE') : ''}</Text>
    {quote ? <>
      <View style={bitcoinStyles.box}>
        <Text style={bitcoinStyles.value}>{t('Deposit amount')}</Text><BitcoinMoney amount={quote.grossSats} />
        <Text style={bitcoinStyles.value}>{t('Fee, at most')}</Text><BitcoinMoney amount={quote.feeSats} />
        <Text style={bitcoinStyles.value}>{t('Available after claim')}</Text><BitcoinMoney amount={quote.creditSats} />
        <Text style={bitcoinStyles.address} selectable>{quote.operation.txid}:{quote.operation.vout}</Text>
      </View>
      <Text style={bitcoinStyles.note}>{t('This fee is deducted from the deposit. If the fee increases, you must review it again.')}</Text>
      <BitcoinButton label={t('Approve and claim Bitcoin')} onPress={() => void run(claim)} loading={busy} />
    </> : <>
      <Text style={bitcoinStyles.muted}>{t('Network confirmation and a claim are required before these Bitcoin become available. The claim fee is deducted from the deposit. The exact fee and minimum viable amount are available after the transaction is detected; review them before approving. Very small deposits may not cover the fee.')}</Text>
      <Text style={bitcoinStyles.note}>{t('This address is reusable. Deposits are tracked as wallet incoming, not as payment of a specific Lightning request. Detection starts after Bitcoin network confirmation.')}</Text>
      {address ? <>
        <View style={{ alignSelf: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 20 }}><QRCode value={address} size={Math.max(100, Math.min(216, width - 110))} /></View>
        <Text selectable style={bitcoinStyles.address}>{address}</Text>
        <BitcoinButton label={t('Copy address')} onPress={() => void run(async () => { await Clipboard.setStringAsync(address); })} />
        <BitcoinButton label={t('Share Bitcoin address')} secondary onPress={() => void run(async () => { await Share.share({ message: `bitcoin:${address}` }); })} />
      </> : <BitcoinButton label={t('Show deposit address')} onPress={() => void run(showAddress)} loading={busy} disabled={!wallet} />}
      <Text style={bitcoinStyles.title}>{t('Incoming Bitcoin')}</Text>
      {!deposits.length && <Text style={bitcoinStyles.muted}>{t('No confirmed Bitcoin deposit detected yet.')}</Text>}
      {deposits.map(item => <View key={item.id} style={bitcoinStyles.box}>
        <Text style={bitcoinStyles.value}>{t(item.state === 'confirmed' ? 'Completed' : item.state === 'action_required' ? 'Claim required' : 'Payment is being checked')}</Text>
        {item.amountSats > 0 && <BitcoinMoney amount={item.amountSats} />}
        <Text selectable style={bitcoinStyles.address}>{item.txid}:{item.vout}</Text>
        {item.state !== 'confirmed' && <Text style={bitcoinStyles.note}>{t('Not included in your available balance yet.')}</Text>}
        {item.state === 'action_required' && <BitcoinButton label={t('Review claim fee')} disabled={!wallet} loading={busy} onPress={() => void run(async () => {
          const current = walletSession.captureRuntime();
          const prepared = await prepareBitcoinDeposit(wallet!, item, current);
          current(); setQuote(prepared);
        })} />}
      </View>)}
      {error && <Text style={bitcoinStyles.warning}>{t('Connection interrupted. Deposits remain tracked; checking again automatically.')}</Text>}
      <BitcoinButton label={t('Check status')} secondary onPress={refresh} disabled={busy} />
    </>}
  </ScrollView>;
}
