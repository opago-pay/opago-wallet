import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/hooks/useLanguage';
import { useColorMode } from '@/hooks/useColorMode';
import { adaptColor } from '@/lib/theme-styles';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { TouchableOpacity, TextInput } from '@/components/ui/wallet-interaction';
import { AssetIcon } from '@/components/ui/asset-icon';
import { AdvancedOptions } from '@/components/ui/advanced-options';
import { CloseWalletScreen } from '@/components/navigation/close-wallet-screen';
import { MoonPayCheckout } from '@/components/buy/moonpay-checkout';
import { appConfig } from '@/lib/config';
import { t } from '@/lib/i18n';
import { loadMoonPayConfig, parseMoonPayEurAmount, type MoonPayAsset, type MoonPayConfig } from '@/lib/moonpay';
import { validateBitcoinAddress } from '@/lib/bitcoin/destination';
import { bitcoinScope } from '@/lib/bitcoin/onchain';
import { bitcoinDepositWatch, bitcoinStaticAddressCache } from '@/lib/bitcoin/store-native';
import { parseHederaAccountId, HEDERA_NETWORK } from '@/lib/hedera/config';
import { walletSession } from '@/lib/wallet-session';
import { withTimeout } from '@/lib/promise-timeout';
import { clearMoonPayReturnNotice, hasMoonPayReturnNotice, markMoonPayBrowserOpened } from '@/lib/moonpay-return-native';
import { markNavigationReady, measurePerformance } from '@/lib/performance-trace';

type DestinationState = { status: 'loading' | 'ready' | 'error'; address?: string; message?: string };

export default function BuyScreen() {
  useLanguage();
  useColorMode();
  useEffect(() => { markNavigationReady('buy'); }, []);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sparkWallet, walletReady, hederaPublicKey, refreshHederaAccount, backupStatus } = useWalletAuth();
  const [asset, setAsset] = useState<MoonPayAsset>('BTC');
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [eurInput, setEurInput] = useState('');
  const [config, setConfig] = useState<MoonPayConfig | null>(null);
  const [configState, setConfigState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [destination, setDestination] = useState<DestinationState>({ status: 'loading' });
  useEffect(() => {
    if (!hederaPublicKey) return;
    let cancelled = false;
    void hasMoonPayReturnNotice(hederaPublicKey).then(found => {
      if (found && !cancelled) router.replace('/(tabs)');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [hederaPublicKey, router]);

  useEffect(() => {
    let cancelled = false;
    void measurePerformance('buy.config', loadMoonPayConfig).then(value => {
      if (cancelled) return;
      setConfig(value);
      setConfigState(value ? 'ready' : 'unavailable');
    }).catch(() => { if (!cancelled) setConfigState('unavailable'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDestination({ status: 'loading' });
    if (!walletReady) return () => { cancelled = true; };
    void measurePerformance('buy.address', async () => {
      const assertWallet = walletSession.captureRuntime();
      const assertCurrent = () => { assertWallet(); if (cancelled) throw new Error('Wallet changed.'); };
      if (asset === 'BTC') {
        if (appConfig.sparkNetwork !== 'MAINNET' || !sparkWallet) {
          throw new Error(t('Bitcoin buying requires a Mainnet wallet.'));
        }
        const scope = await bitcoinScope(sparkWallet, 'MAINNET');
        assertCurrent();
        const cached = await bitcoinStaticAddressCache.load(scope, 'MAINNET', assertCurrent);
        const address = cached || validateBitcoinAddress(
          await withTimeout(sparkWallet.getStaticDepositAddress(), 20_000, 'Bitcoin deposit address unavailable.'),
          'MAINNET',
        );
        assertCurrent();
        await bitcoinDepositWatch.enable(scope, assertCurrent);
        if (!cached) await bitcoinStaticAddressCache.save(scope, address, 'MAINNET', assertCurrent);
        assertCurrent();
        return address;
      }
      if (HEDERA_NETWORK !== 'mainnet' || !appConfig.isHederaMainnet) {
        throw new Error(t('HBAR buying requires a Mainnet account.'));
      }
      const account = await withTimeout(refreshHederaAccount(), 12_000, 'Hedera account unavailable.');
      assertCurrent();
      if (!account) throw new Error(t('Activate your HBAR account in Receive > Advanced options before buying.'));
      if (!hederaPublicKey || account.publicKey !== hederaPublicKey) {
        throw new Error(t('This HBAR account does not belong to the current wallet.'));
      }
      return parseHederaAccountId(account.accountId);
    }).then(address => { if (!cancelled) setDestination({ status: 'ready', address }); })
      .catch(cause => { if (!cancelled) setDestination({
        status: 'error',
        message: cause instanceof Error && [
          t('Bitcoin buying requires a Mainnet wallet.'), t('HBAR buying requires a Mainnet account.'),
          t('Activate your HBAR account in Receive > Advanced options before buying.'), t('This HBAR account does not belong to the current wallet.'),
        ].includes(cause.message) ? cause.message : t('Receiving address could not be verified. Please try again.'),
      }); });
    return () => { cancelled = true; };
  }, [asset, walletReady, sparkWallet, hederaPublicKey, refreshHederaAccount]);

  const amount = parseMoonPayEurAmount(eurInput);
  const selectedAsset = config?.assets.find(item => item.asset === asset);
  const available = configState === 'ready' && !!selectedAsset;
  const canBuy = backupStatus === 'verified' || backupStatus === 'deferred';

  return <ScrollView style={{ flex: 1, backgroundColor: adaptColor('#101012', 'backgroundColor') }} keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 36, paddingHorizontal: 22 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: adaptColor('#fff', 'color'), fontSize: 34, fontWeight: '800', flex: 1 }}>{t('Buy crypto')}</Text>
      <CloseWalletScreen />
    </View>
    <Text style={{ color: adaptColor('#a9a9b2', 'color'), fontSize: 16, marginTop: 8 }}>{t('Choose what you want to buy.')}</Text>

    <Text style={{ color: adaptColor('#fff', 'color'), fontSize: 16, fontWeight: '700', marginTop: 34, marginBottom: 12 }}>{t('Asset')}</Text>
    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: asset === 'BTC' }} onPress={() => setAsset('BTC')}
      style={{ minHeight: 64, backgroundColor: adaptColor(asset === 'BTC' ? '#292414' : '#1b1b20', 'backgroundColor'), borderRadius: 17,
        borderWidth: 1, borderColor: asset === 'BTC' ? '#ffb000' : adaptColor('#303035', 'borderColor'), flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17 }}>
      <AssetIcon asset="bitcoin" size={30} />
      <Text style={{ color: adaptColor('#fff', 'color'), fontSize: 17, fontWeight: '700', flex: 1 }}>Bitcoin</Text>
      {asset === 'BTC' && <Ionicons name="checkmark" size={21} color="#ffb000" />}
    </TouchableOpacity>
    <AdvancedOptions expanded={advancedExpanded} onChange={expanded => { setAdvancedExpanded(expanded); if (!expanded && asset === 'HBAR') setAsset('BTC'); }}>
      <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: asset === 'HBAR' }} onPress={() => setAsset('HBAR')}
        style={{ minHeight: 60, backgroundColor: adaptColor(asset === 'HBAR' ? '#292414' : '#1b1b20', 'backgroundColor'), borderRadius: 16,
          borderWidth: 1, borderColor: asset === 'HBAR' ? '#ffb000' : adaptColor('#303035', 'borderColor'), flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17 }}>
        <AssetIcon asset="hedera" size={30} />
        <Text style={{ color: adaptColor('#fff', 'color'), fontSize: 16, fontWeight: '700', flex: 1 }}>HBAR</Text>
        {asset === 'HBAR' && <Ionicons name="checkmark" size={21} color="#ffb000" />}
      </TouchableOpacity>
    </AdvancedOptions>

    <Text style={{ color: adaptColor('#fff', 'color'), fontSize: 16, fontWeight: '700', marginTop: 28, marginBottom: 12 }}>{t('Amount in EUR')}</Text>
    <View style={{ minHeight: 72, backgroundColor: adaptColor('#1b1b20', 'backgroundColor'), borderRadius: 18, borderWidth: 1, borderColor: adaptColor('#303035', 'borderColor'),
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 }}>
      <TextInput value={eurInput} onChangeText={setEurInput}
        keyboardType="number-pad" placeholder="0" placeholderTextColor="#777780" accessibilityLabel={t('Amount in EUR')}
        style={{ flex: 1, color: adaptColor('#fff', 'color'), fontSize: 30, fontWeight: '700', paddingVertical: 12 }} />
      <Text style={{ color: adaptColor('#ffb000', 'color'), fontSize: 24, fontWeight: '700' }}>€</Text>
    </View>

    <Text style={{ color: adaptColor('#fff', 'color'), fontSize: 16, fontWeight: '700', marginTop: 28, marginBottom: 12 }}>{t('Arrives in this wallet')}</Text>
    <View style={{ backgroundColor: adaptColor('#1b1b20', 'backgroundColor'), borderRadius: 18, borderWidth: 1, borderColor: adaptColor('#303035', 'borderColor'), padding: 18, minHeight: 83, justifyContent: 'center' }}>
      <Text style={{ color: adaptColor('#a9a9b2', 'color'), marginBottom: 5 }}>{asset === 'BTC' ? t('Bitcoin on-chain') : 'Hedera Mainnet'}</Text>
      {destination.status === 'loading' ? <ActivityIndicator color="#ffb000" style={{ alignSelf: 'flex-start' }} /> :
        destination.status === 'ready' ? <Text selectable style={{ color: adaptColor('#fff', 'color'), fontSize: 14, fontWeight: '600' }}>{destination.address}</Text> :
          <Text accessibilityRole="alert" style={{ color: adaptColor('#f0a66b', 'color'), fontSize: 14 }}>{destination.message}</Text>}
    </View>

    <Text style={{ color: adaptColor('#a9a9b2', 'color'), lineHeight: 21, marginTop: 18, marginBottom: 24 }}>
      {t('Purchase and identity verification are handled by MoonPay. You will see fees and the final amount before paying.')}
    </Text>

    {backupStatus === 'loading' ? <ActivityIndicator color="#ffb000" /> : !canBuy ? <TouchableOpacity onPress={() => router.push('/(tabs)/settings')} accessibilityRole="button"
      style={{ minHeight: 56, borderRadius: 18, backgroundColor: adaptColor('#ffb000', 'backgroundColor'), justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: adaptColor('#15150e', 'color'), fontWeight: '800' }}>{t('Back up my wallet')}</Text>
    </TouchableOpacity> : configState === 'loading' ? <ActivityIndicator color="#ffb000" /> : !available ?
      <Text accessibilityRole="alert" style={{ color: adaptColor('#f0a66b', 'color'), textAlign: 'center', fontWeight: '600' }}>{t('Buying is not available yet.')}</Text> :
      !amount ? <Text style={{ color: adaptColor('#a9a9b2', 'color'), textAlign: 'center' }}>{t('Enter a whole EUR amount to continue.')}</Text> :
        destination.status !== 'ready' ? null : <MoonPayCheckout
          key={`${asset}:${amount}:${destination.address}:${config!.environment}:${config!.publicApiKey}`}
          config={config!} asset={selectedAsset!} destination={destination.address!} eurAmount={amount}
          onBrowserOpen={() => hederaPublicKey ? markMoonPayBrowserOpened(hederaPublicKey) : Promise.resolve()}
          onBrowserError={clearMoonPayReturnNotice}
          onReturn={() => router.replace('/(tabs)')} />}
  </ScrollView>;
}
