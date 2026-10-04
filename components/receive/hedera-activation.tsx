import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { useLanguage } from '@/hooks/useLanguage';
import { useAccessibleStatus } from '@/hooks/useAccessibleStatus';
import { useIsFocused } from '@react-navigation/native';
import { t } from '@/lib/i18n';
import { normalizeHederaPublicKey } from '@/lib/hedera/keys';
import { useWalletAuth } from '@/hooks/useWalletAuth';

import { ACTIVATION_ERROR_TEXT } from '@/lib/hedera/activation-errors';

export function HederaActivation({ publicKey, network }: { publicKey: string; network: string }) {
  useLanguage();
  const isFocused = useIsFocused();
  const [showDetails, setShowDetails] = useState(false);
  const activationAvailable = !!process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;
  const { activateHederaAccount, hederaActivationJob, hederaActivationError, hederaActivationBusy } = useWalletAuth();
  const terminal = ['failed', 'needs_review'].includes(hederaActivationJob?.status || '');
  const statusText = terminal
    ? 'We could not create your address. Please contact Opago support.'
    : !activationAvailable
      ? 'Address setup is temporarily unavailable. Please try again later.'
      : hederaActivationBusy
        ? 'This can take a few minutes. Your address will appear here automatically.'
        : hederaActivationError
          ? ACTIVATION_ERROR_TEXT[hederaActivationError] || 'We could not check your address. Please try again.'
          : hederaActivationJob
            ? 'Your address is still being created. Check its status again in a moment.'
            : 'Create your address once to receive HBAR.';
  useAccessibleStatus(hederaActivationBusy || hederaActivationJob || hederaActivationError ? t(statusText) : null, isFocused);

  async function copyPublicKey() {
    await Clipboard.setStringAsync(normalizeHederaPublicKey(publicKey));
    Alert.alert(t('Copied'), t('Public key copied for account activation. This is not a payment address.'));
  }

  return <View style={styles.card}>
    <View style={styles.iconCircle}>
      <Ionicons name="wallet-outline" size={36} color={adaptColor('#ffb000', 'color')} />
    </View>
    <Text style={styles.title} accessibilityRole="header">{t(hederaActivationBusy ? 'Creating your address…' : 'Your HBAR address')}</Text>
    <Text style={styles.body} accessibilityLiveRegion="polite">{t(statusText)}</Text>
    {activationAvailable && !terminal && !hederaActivationBusy &&
      <TouchableOpacity style={styles.activateButton} accessibilityRole="button"
        onPress={() => { void activateHederaAccount().catch(() => undefined); }}>
        <Text style={styles.activateButtonText}>{t(hederaActivationJob ? 'Check status' : hederaActivationError ? 'Try again' : 'Create address')}</Text>
      </TouchableOpacity>}
    {hederaActivationBusy && <View style={styles.waiting}>
      <ActivityIndicator size="small" color={adaptColor('#ffb000', 'color')} accessibilityLabel={t('Creating your address…')} />
    </View>}
    <TouchableOpacity style={styles.detailsButton} accessibilityRole="button" accessibilityLabel={t('Technical details')}
      accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(value => !value)}>
      <Text style={styles.detailsLabel}>{t('Technical details')}</Text>
      <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={adaptColor('#a5a5af', 'color')} />
    </TouchableOpacity>
    {showDetails && <View style={styles.details}>
      <Text style={styles.caption}>{network}</Text>
      {hederaActivationJob && <Text style={styles.key} selectable>{hederaActivationJob.job_id}</Text>}
      <Text style={styles.key} selectable>{normalizeHederaPublicKey(publicKey)}</Text>
      <TouchableOpacity style={styles.copyButton} accessibilityRole="button" onPress={() => void copyPublicKey()}>
        <Ionicons name="copy-outline" size={18} color={adaptColor('#fff', 'color')} />
        <Text style={styles.copyLabel}>{t('Copy activation public key')}</Text>
      </TouchableOpacity>
    </View>}
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  card: { paddingVertical: 24, alignItems: 'center' },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#1b1b20', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 20, textAlign: 'center' },
  body: { color: '#b5b5bf', fontSize: 16, lineHeight: 24, marginTop: 12, textAlign: 'center' },
  waiting: { marginTop: 24, minHeight: 48, justifyContent: 'center' },
  caption: { color: '#92929e', fontSize: 13, lineHeight: 20, marginTop: 12 },
  detailsButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginTop: 24 },
  detailsLabel: { color: '#b5b5bf', fontSize: 14, flexShrink: 1 },
  details: { alignSelf: 'stretch' },
  key: { color: '#b5b5bf', fontFamily: 'monospace', fontSize: 13, lineHeight: 21, marginTop: 14 },
  copyButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderColor: '#33333a', borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  copyLabel: { color: '#fff', fontSize: 14, flexShrink: 1 },
  activateButton: { alignSelf: 'stretch', minHeight: 56, backgroundColor: '#ffb000', borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 24, padding: 16 },
  activateButtonText: { color: '#15150e', fontSize: 17, fontWeight: '700', textAlign: 'center' },
}));
