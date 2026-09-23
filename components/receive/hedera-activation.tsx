import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { normalizeHederaPublicKey } from '@/lib/hedera/keys';

export function HederaActivation({ publicKey, network }: { publicKey: string; network: string }) {
  useLanguage();
  const [showDetails, setShowDetails] = useState(false);

  async function copyPublicKey() {
    await Clipboard.setStringAsync(normalizeHederaPublicKey(publicKey));
    Alert.alert(t('Copied'), t('Public key copied for account activation. This is not a payment address.'));
  }

  return <View style={styles.card}>
    <Ionicons name="wallet-outline" size={30} color="#ffb000" />
    <Text style={styles.title} accessibilityRole="header">{t('Activate HBAR first')}</Text>
    <Text style={styles.body}>{t('This wallet needs a one-time Hedera account setup before it can receive HBAR from HashPack.')}</Text>
    <Text style={styles.body}>{t('HashPack requires a numeric account ID for this wallet. It does not accept this wallet’s activation alias.')}</Text>
    <View style={styles.waiting}>
      <ActivityIndicator size="small" color="#ffb000" />
      <Text style={styles.waitingText}>{t('Waiting for activation on {network}', { network })}</Text>
    </View>
    <Text style={styles.caption}>{t('After activation, your account ID and payment QR will appear here automatically.')}</Text>
    <TouchableOpacity style={styles.detailsButton} accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(value => !value)}>
      <Text style={styles.detailsLabel}>{t('Account activation details')}</Text>
      <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color="#a5a5af" />
    </TouchableOpacity>
    {showDetails && <View>
      <Text style={styles.caption}>{t('Share only this public key with whoever creates your Hedera account. Your recovery words are never needed.')}</Text>
      <Text style={styles.key} selectable>{normalizeHederaPublicKey(publicKey)}</Text>
      <TouchableOpacity style={styles.copyButton} accessibilityRole="button" onPress={() => void copyPublicKey()}>
        <Ionicons name="copy-outline" size={18} color={adaptColor('#fff', 'color')} />
        <Text style={styles.copyLabel}>{t('Copy activation public key')}</Text>
      </TouchableOpacity>
    </View>}
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  card: { paddingVertical: 12 },
  title: { color: '#fff', fontSize: 23, fontWeight: '700', marginTop: 14 },
  body: { color: '#b5b5bf', fontSize: 15, lineHeight: 23, marginTop: 12 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24 },
  waitingText: { color: '#ffb000', fontSize: 14, flex: 1 },
  caption: { color: '#92929e', fontSize: 13, lineHeight: 20, marginTop: 12 },
  detailsButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48, marginTop: 16 },
  detailsLabel: { color: '#b5b5bf', fontSize: 14, flex: 1 },
  key: { color: '#b5b5bf', fontFamily: 'monospace', fontSize: 13, lineHeight: 21, marginTop: 14 },
  copyButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderColor: '#33333a', borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  copyLabel: { color: '#fff', fontSize: 14, flexShrink: 1 },
}));
