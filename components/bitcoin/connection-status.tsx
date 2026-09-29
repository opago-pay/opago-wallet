import { Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { t } from '@/lib/i18n';
import { adaptColor } from '@/lib/theme-styles';

export function BitcoinConnectionStatus({ status, error, onRetry }: {
  status: 'idle' | 'connecting' | 'ready' | 'error';
  error: string | null;
  onRetry(): Promise<void>;
}) {
  if (status !== 'error') return null;
  const blocked = status === 'error' && !!error?.includes('previous Bitcoin connection has not stopped');
  return <View accessibilityRole={status === 'error' ? 'alert' : undefined}
    style={{ marginVertical: 12, padding: 16, borderRadius: 16, borderWidth: 1,
      borderColor: adaptColor('#66501d', 'borderColor'), backgroundColor: adaptColor('#211b0f', 'backgroundColor') }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ color: adaptColor('#f4d38a', 'color'), fontSize: 15, fontWeight: '700', flex: 1 }}>
        {t('Bitcoin connection unavailable')}
      </Text>
    </View>
    {status === 'error' && <>
      <Text style={{ color: adaptColor('#e6ddc8', 'color'), fontSize: 14, lineHeight: 21, marginTop: 8 }}>
        {t(blocked
          ? 'The previous Bitcoin connection has not stopped. Close Opago completely and reopen it before retrying.'
          : 'Your wallet is accessible, but Bitcoin is not connected. Try again when your connection is available.')}
      </Text>
      {!blocked && <TouchableOpacity accessibilityRole="button" onPress={() => void onRetry()}
        style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, marginTop: 8 }}>
        <Text style={{ color: adaptColor('#ffca54', 'color'), fontWeight: '700' }}>{t('Reconnect Bitcoin')}</Text>
      </TouchableOpacity>}
    </>}
  </View>;
}
