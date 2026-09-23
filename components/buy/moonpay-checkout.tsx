import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMoonPaySdk } from '@moonpay/react-native-moonpay-sdk';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { t } from '@/lib/i18n';
import { walletSession } from '@/lib/wallet-session';
import {
  assertMoonPayCheckoutUrl,
  assertSignedMoonPayCheckout,
  signMoonPayCheckout,
  type MoonPayConfig,
  type MoonPayAssetConfig,
} from '@/lib/moonpay';

export function MoonPayCheckout({ config, asset, destination, eurAmount, onBrowserOpen, onBrowserError, onReturn }: {
  config: MoonPayConfig;
  asset: MoonPayAssetConfig;
  destination: string;
  eurAmount: string;
  onBrowserOpen(): Promise<void>;
  onBrowserError(): Promise<void>;
  onReturn(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const signed = useRef<{ unsignedUrl: string; signature: string } | null>(null);
  useEffect(() => () => { mounted.current = false; }, []);

  const expected = {
    environment: config.environment,
    apiKey: config.publicApiKey,
    currencyCode: asset.moonpayCurrencyCode,
    walletAddress: destination,
    eurAmount,
    redirectUrl: config.redirectUrl,
  };
  const { ready, generateUrlForSigning, updateSignature, openWithInAppBrowser } = useMoonPaySdk({
    sdkConfig: {
      flow: 'buy',
      environment: config.environment,
      params: {
        apiKey: config.publicApiKey,
        currencyCode: asset.moonpayCurrencyCode,
        walletAddress: destination,
        baseCurrencyCode: 'eur',
        baseCurrencyAmount: eurAmount,
        redirectURL: config.redirectUrl,
      },
    },
    browserOpener: {
      open: async url => {
        const proof = signed.current;
        if (!proof) throw new Error('Unsigned MoonPay checkout.');
        assertMoonPayCheckoutUrl(url, { ...expected, signed: true });
        assertSignedMoonPayCheckout(proof.unsignedUrl, url, proof.signature);
        await onBrowserOpen();
        try { await WebBrowser.openBrowserAsync(url); }
        catch (cause) { await onBrowserError(); throw cause; }
      },
    },
  });

  async function openCheckout() {
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    signed.current = null;
    let opened = false;
    try {
      const assertWallet = walletSession.captureRuntime();
      const unsignedUrl = generateUrlForSigning({ variant: 'inapp-browser' });
      if (!unsignedUrl) throw new Error('MoonPay is not ready.');
      assertMoonPayCheckoutUrl(unsignedUrl, expected);
      const signature = await signMoonPayCheckout(unsignedUrl);
      if (!mounted.current) return;
      assertWallet();
      updateSignature(signature);
      signed.current = { unsignedUrl, signature };
      assertWallet();
      await openWithInAppBrowser();
      opened = true;
    } catch {
      if (mounted.current) setError(true);
    } finally {
      signed.current = null;
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        if (opened) onReturn();
      }
    }
  }

  return <View>
    <TouchableOpacity
      accessibilityRole="button"
      disabled={!ready || busy}
      onPress={() => void openCheckout()}
      style={{ minHeight: 58, borderRadius: 18, backgroundColor: '#ffb000', alignItems: 'center', justifyContent: 'center', opacity: !ready || busy ? 0.5 : 1 }}
    >
      {busy ? <ActivityIndicator color="#15150e" /> : <Text style={{ color: '#15150e', fontSize: 17, fontWeight: '800' }}>{t('Continue to MoonPay')}</Text>}
    </TouchableOpacity>
    {error && <Text accessibilityRole="alert" style={{ color: '#f0a66b', textAlign: 'center', marginTop: 12 }}>
      {t('MoonPay could not be opened. Please try again.')}
    </Text>}
  </View>;
}
