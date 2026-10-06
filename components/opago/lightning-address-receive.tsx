import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { WalletQrCode } from '../receive/wallet-qr-code';
import { useOpagoAccount } from '../../hooks/useOpagoAccount';
import { f3IntegrationAvailable } from '../../lib/opago/runtime-native';
import { activeLightningAddress } from '../../lib/opago/address';
import { themeColor } from '../../lib/theme-styles';
import { t } from '../../lib/i18n';

/** No account integration is loaded for the ordinary local-wallet receive flow. */
export function PersonalLightningAddressReceive(props: { focused: boolean; size: number }) {
  return f3IntegrationAvailable() ? <LinkedLightningAddress {...props} /> : null;
}
function LinkedLightningAddress({ focused, size }: { focused: boolean; size: number }) {
  const { runtime, run } = useOpagoAccount(false);
  const runRef = useRef(run); runRef.current = run;
  useEffect(() => {
    if (!focused || !runtime?.account.state.session) return;
    const refresh = () => { void runRef.current(() => runtime.account.refresh()); };
    refresh(); const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [runtime, focused]);
  if (!focused || !runtime?.account.state.session) return null;
  const address = activeLightningAddress(runtime.account, runtime.publicAddressOrigin);
  return <View style={{ gap: 12, marginBottom: 24, alignItems: 'center' }}>
    <Text style={{ color: themeColor('text'), fontSize: 20, fontWeight: '600' }}>{t('Personal Lightning address')}</Text>
    {address ? <>
      <Text selectable style={{ color: themeColor('text'), fontSize: 17 }}>{address.address}</Text>
      <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 20 }}>
        <WalletQrCode value={address.qr_payload} size={size} focused={focused} logo="lightning" />
      </View>
      <Text style={{ color: themeColor('secondary'), fontSize: 15, lineHeight: 21 }}>{t('Your personal address lets the sender choose the amount. Use the invoice below to request a specific amount.')}</Text>
    </> : <Text style={{ color: themeColor('secondary'), fontSize: 15 }}>{t('Address availability must be confirmed by the backend. Check your OPAGO account status.')}</Text>}
    <Text style={{ color: themeColor('text'), fontSize: 20, fontWeight: '600', marginTop: 8 }}>{t('One-time Lightning invoice')}</Text>
  </View>;
}
