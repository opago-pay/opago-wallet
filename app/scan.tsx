import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { Camera } from 'expo-camera';
import { useRouter } from 'expo-router';
import { ScannerView } from '@/components/send/payment-state-views';
import { scannerPermission } from '@/lib/scanner-permission';
import { paymentScanInbox } from '@/lib/payment-scan';

export default function ScanScreen() {
  useLanguage();
  const router = useRouter();
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof scannerPermission>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const consumed = useRef(false);
  const requesting = useRef(false);

  const checkPermission = useCallback(async (request = false) => {
    if (requesting.current) return;
    if (Platform.OS === 'web') { setError(t('Use the Opago mobile app to scan payment codes.')); return; }
    requesting.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await scannerPermission(Camera, request);
      if (mounted.current) setPermission(result);
    } catch {
      if (mounted.current) setError(t('Could not open the camera. Please try again.'));
    } finally {
      requesting.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void checkPermission();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void checkPermission();
    });
    return () => { mounted.current = false; subscription.remove(); };
  }, [checkPermission]);

  function cancel() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  if (permission?.granted && !error) return (
    <ScannerView
      onCancel={cancel}
      onError={() => setError(t('The camera is unavailable. Close other camera apps and try again.'))}
      onScanned={value => {
        if (consumed.current) return;
        consumed.current = true;
        try {
          const scanResultKey = paymentScanInbox.save(value);
          router.replace({ pathname: '/(tabs)/send', params: { scanResultKey } });
        } catch (cause) {
          consumed.current = false;
          setError(cause instanceof Error ? cause.message : t('Could not read this payment code.'));
        }
      }}
    />
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("Scan payment code")}</Text>
      {busy || (!permission && !error) ? (
        <><ActivityIndicator color="#ffb000" size="large" /><Text style={styles.body}>{t("Opening camera…")}</Text></>
      ) : (
        <>
          <Text style={styles.body}>{t(error || 'Allow camera access to scan a payment QR code.')}</Text>
          <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => {
            if (permission && !permission.granted && !permission.canAskAgain) void Linking.openSettings().catch(() => setError(t('Open your device settings to allow camera access for Opago.')));
            else void checkPermission(true);
          }}>
            <Text style={styles.buttonText}>{permission?.granted ? t('Try again') : permission?.canAskAgain === false ? t('Open device settings') : t('Allow camera')}</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={styles.cancel} accessibilityRole="button" onPress={cancel}><Text style={styles.body}>{t("Cancel")}</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c', padding: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 27, color: '#fff', fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  body: { color: '#b8b8c0', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 16 },
  button: { alignSelf: 'stretch', backgroundColor: '#ffb000', padding: 18, borderRadius: 16, marginTop: 24, minHeight: 56 },
  buttonText: { textAlign: 'center', color: '#111', fontWeight: '700', fontSize: 16 },
  cancel: { minHeight: 52, padding: 12, marginTop: 12 },
});
