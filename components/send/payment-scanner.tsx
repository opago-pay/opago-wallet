import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, BackHandler, Keyboard, Linking, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { TextInput as NativeTextInput } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput, TouchableOpacity } from '@/components/ui/wallet-interaction';
import { useLanguage } from '@/hooks/useLanguage';
import { useColorMode } from '@/hooks/useColorMode';
import { t } from '@/lib/i18n';
import { scannerPermission } from '@/lib/scanner-permission';
import { hasBackCameraTorch } from '@/lib/camera-capabilities';
import { recognizePayment, type RecognizedPayment } from '@/lib/payment-recognition';
import { friendlyPaymentMessage } from '@/lib/payment-errors';
import { walletSession } from '@/lib/wallet-session';
import { ScannerSheet } from './scanner-sheet';
import { ScannerShade, ScannerSuccessBackground } from './scanner-success-background';
import { scannerStyles as styles } from './scanner-styles';
import { measurePerformance } from '@/lib/performance-trace';

export function PaymentScanner(props: { onDetected(value: string): void; onCancel(): void }) {
  useLanguage();
  useColorMode();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof scannerPermission>> | null>(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState(false);
  const [entry, setEntry] = useState('');
  const [recognized, setRecognized] = useState<RecognizedPayment | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torch, setTorch] = useState(false);
  const entryInput = useRef<NativeTextInput | null>(null);
  const mounted = useRef(true);
  const requesting = useRef(false);
  const generation = useRef(0);
  const inputBusy = useRef(false);
  const mode = useRef<'scan' | 'manual' | 'error' | 'leaving'>('scan');
  const focusRef = useRef(focused);
  focusRef.current = focused;
  const visible = useRef(focused && active);
  visible.current = focused && active;

  const checkPermission = useCallback(async (request = false) => {
    if (requesting.current) return;
    if (Platform.OS === 'web') { setCameraError('Use the Opago mobile app to scan payment codes.'); return; }
    requesting.current = true;
    setPermissionBusy(true);
    setCameraError('');
    try {
      const result = await measurePerformance('scanner.permission', () => scannerPermission(Camera, request));
      if (mounted.current) setPermission(result);
    } catch {
      if (mounted.current) setCameraError('Could not open the camera. Please try again.');
    } finally {
      requesting.current = false;
      if (mounted.current) setPermissionBusy(false);
    }
  }, []);

  const invalidate = useCallback(() => {
    generation.current += 1;
    inputBusy.current = false;
    setChecking(false);
    setTorch(false);
  }, []);
  const resume = useCallback(() => {
    invalidate();
    mode.current = 'scan';
    setManual(false); setRecognized(null); setError(''); setEntry('');
    Keyboard.dismiss();
  }, [invalidate]);
  const close = useCallback(() => {
    invalidate(); mode.current = 'leaving'; Keyboard.dismiss(); props.onCancel();
  }, [invalidate, props]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      visible.current = focusRef.current && state === 'active';
      if (state !== 'active') invalidate();
      setActive(state === 'active');
    });
    void hasBackCameraTorch().then(value => { if (mounted.current) setTorchSupported(value); });
    return () => { mounted.current = false; generation.current += 1; subscription.remove(); };
  }, [invalidate]);
  useEffect(() => {
    if (focused && active) void checkPermission();
    else invalidate();
  }, [focused, active, checkPermission, invalidate]);
  useEffect(() => {
    if (!focused) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mode.current === 'leaving') return true;
      if (manual || recognized || error || checking) resume(); else close();
      return true;
    });
    return () => subscription.remove();
  }, [focused, manual, recognized, error, checking, resume, close]);

  const scanning = !manual && !recognized && !error && !checking;
  const cameraReady = focused && active && permission?.granted && !cameraError && !manual;

  function showError(message: string) {
    mode.current = mode.current === 'manual' ? 'manual' : 'error';
    setError(message);
    AccessibilityInfo.announceForAccessibility(t(message));
  }
  async function recognize(value: string, ticket: number, assertSession: () => void) {
    const current = () => mounted.current && visible.current && generation.current === ticket;
    try {
      const result = await measurePerformance('scanner.recognize', () => recognizePayment(value));
      if (!current()) return;
      assertSession();
      mode.current = 'leaving';
      Keyboard.dismiss(); setManual(false); setRecognized(result); setError('');
      // Haptics are optional and cannot turn successful validation into failure.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      AccessibilityInfo.announceForAccessibility(t('Code recognized'));
      // Recognition only advances to amount entry / fee review. Submission and
      // onchain signing preparation still need their existing explicit actions.
      assertSession();
      props.onDetected(result.input);
    } catch (cause) {
      if (current()) { setRecognized(null); showError(friendlyPaymentMessage(cause, 'Bitcoin')); }
    } finally {
      if (current()) { inputBusy.current = false; setChecking(false); }
    }
  }
  function detect(value: string) {
    if (inputBusy.current || !mounted.current || !visible.current || mode.current !== 'scan') return;
    inputBusy.current = true; setChecking(true); setTorch(false);
    const ticket = ++generation.current;
    try { void recognize(value, ticket, walletSession.capture()); }
    catch { inputBusy.current = false; setChecking(false); showError('Could not read this payment code.'); }
  }
  async function paste() {
    if (inputBusy.current || !visible.current || !['scan', 'error'].includes(mode.current)) return;
    mode.current = 'scan'; setError('');
    inputBusy.current = true; setChecking(true); setTorch(false);
    const ticket = ++generation.current;
    try {
      const assertSession = walletSession.capture();
      const value = await measurePerformance('scanner.clipboard', () => Clipboard.getStringAsync());
      if (!mounted.current || !visible.current || generation.current !== ticket) return;
      assertSession();
      if (!value.trim()) { showError('Your clipboard is empty.'); return; }
      await recognize(value, ticket, assertSession);
    } catch {
      if (mounted.current && visible.current && generation.current === ticket) showError('Could not paste. Please try again or enter the recipient manually.');
    } finally {
      if (mounted.current && generation.current === ticket) { inputBusy.current = false; setChecking(false); }
    }
  }
  function enterManually() {
    if (mode.current === 'leaving' || !visible.current) return;
    invalidate(); mode.current = 'manual'; setError(''); setManual(true);
  }
  function submitEntry() {
    if (inputBusy.current || !entry.trim() || mode.current !== 'manual') return;
    inputBusy.current = true; setChecking(true); setError('');
    const ticket = ++generation.current;
    try { void recognize(entry, ticket, walletSession.capture()); }
    catch { inputBusy.current = false; setChecking(false); showError('Could not read this payment code.'); }
  }

  const finderSize = Math.min(264, width - 72, Math.max(120, (height - insets.top - insets.bottom - 300) * 0.8));
  const edge = recognized ? '#8de4bd' : '#ffb000';
  const modal = manual || !!recognized;
  return <View style={styles.screen}>
    {recognized ? <ScannerSuccessBackground /> : <>
    {/* Keep the original scanner lifecycle: one live camera with QR detection,
        then unmount it on capture. Retrying creates a fresh camera session;
        imperative pause/resume can race Android camera rebinding. */}
    {cameraReady && scanning && <CameraView style={StyleSheet.absoluteFill} facing="back"
      enableTorch={torch && visible.current} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onMountError={() => { setTorch(false); setCameraError('The camera is unavailable. Close other camera apps and try again.'); }}
      onBarcodeScanned={({ data }) => detect(data)} />}
    <ScannerShade />
    <ScrollView style={styles.screenContent} contentContainerStyle={[styles.page, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 20) }]}
      importantForAccessibility={modal ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={modal}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: '#f9f9fa' }]}>{t('Send Bitcoin')}</Text>
        <TouchableOpacity style={styles.circle} accessibilityRole="button" accessibilityLabel={t('Close scanner')} onPress={close}>
          <Ionicons name="close" size={22} color="#f9f9fa" />
        </TouchableOpacity>
      </View>
      <Text style={[styles.prompt, { color: '#d0cfd1' }]}>{t('Hold the QR code inside the frame.')}</Text>
      <View style={styles.stage}>
        {cameraReady || recognized || manual ? <>
          <View style={{ width: finderSize, height: finderSize }} accessible={!!recognized} accessibilityLabel={recognized ? t('Code recognized') : undefined}>
            {(recognized || checking || error) && <View style={styles.finderStatus}>
              {recognized ? <><View style={styles.check}><Ionicons name="checkmark" size={25} color="#0a251b" /></View><Text style={[styles.foundText, { color: '#fff' }]}>{t('Code recognized')}</Text></>
                : checking ? <><ActivityIndicator color="#ffb000" /><Text style={[styles.foundText, { color: '#fff' }]}>{t('Checking code…')}</Text></>
                  : <Ionicons name="scan-outline" size={36} color="#ffc1ac" />}
            </View>}
            {[styles.topLeft, styles.topRight, styles.bottomLeft, styles.bottomRight].map((corner, i) =>
              <View key={i} style={[styles.corner, corner, { borderColor: edge }]} />)}
          </View>
          {torchSupported && scanning && <TouchableOpacity style={[styles.circle, styles.flash, torch && styles.flashOn]}
            accessibilityRole="button" accessibilityLabel={t(torch ? 'Turn light off' : 'Turn light on')}
            accessibilityState={{ selected: torch }} onPress={() => setTorch(value => !value)}>
            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={21} color={torch ? '#171108' : '#fff'} />
          </TouchableOpacity>}
        </> : <View style={styles.cameraMessage}>
          {permissionBusy || (!permission && !cameraError) ? <><ActivityIndicator color="#ffb000" /><Text style={[styles.message, { color: '#d4d4da' }]}>{t('Opening camera…')}</Text></>
            : <><Ionicons name="camera-outline" size={38} color="#ffb000" /><Text style={[styles.message, { color: '#d4d4da' }]}>{t(cameraError || 'Allow camera access to scan a payment QR code.')}</Text>
              {Platform.OS !== 'web' && <TouchableOpacity style={styles.permissionButton} accessibilityRole="button" onPress={() => {
                if (permission && !permission.granted && !permission.canAskAgain) void Linking.openSettings().catch(() => setCameraError('Open your device settings to allow camera access for Opago.'));
                else void checkPermission(true);
              }}><Text style={styles.permissionText}>{t(permission?.granted ? 'Try again' : permission?.canAskAgain === false ? 'Open device settings' : 'Allow camera')}</Text></TouchableOpacity>}
            </>}
        </View>}
        {!!error && !manual && <View style={styles.errorBox}><Text style={[styles.error, { color: '#ffc1ac' }]} accessibilityRole="alert">{t(error)}</Text>
          <TouchableOpacity style={styles.secondary} accessibilityRole="button" onPress={resume}><Text style={[styles.secondaryText, { color: '#ceced4' }]}>{t('Scan again')}</Text></TouchableOpacity></View>}
      </View>
      <View style={styles.bottom}>
        <View style={[styles.dock, fontScale > 1.5 && styles.dockStack]}>
          <TouchableOpacity style={styles.dockButton} accessibilityRole="button" accessibilityLabel={t('Paste from clipboard')}
            disabled={checking} onPress={() => void paste()}>
            {checking ? <ActivityIndicator color="#ffb000" /> : <Ionicons name="clipboard-outline" size={19} color="#ffb000" />}
            <Text style={[styles.dockText, { color: '#f7f7f7' }]}>{t('Paste')}</Text>
          </TouchableOpacity>
          <View style={fontScale > 1.5 ? styles.dividerHorizontal : styles.divider} />
          <TouchableOpacity style={styles.dockButton} accessibilityRole="button" accessibilityLabel={t('Enter address')} onPress={enterManually}>
            <Ionicons name="create-outline" size={19} color="#eeeef1" /><Text style={[styles.dockText, { color: '#f7f7f7' }]}>{t('Type')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.trust, { color: '#b7b7c0' }]}>{t('You confirm every payment.')}</Text>
      </View>
    </ScrollView>
    </>}
    <ScannerSheet visible={manual && visible.current} onClose={resume} onShow={() => entryInput.current?.focus()} title={t('Enter address')}>
      <Text style={styles.sheetDescription}>{t('Address or payment request')}</Text>
      <Text nativeID="scannerRecipientLabel" style={styles.label}>{t('Recipient')}</Text>
      <TextInput ref={entryInput} style={styles.input} accessibilityLabel={t('Recipient')} accessibilityLabelledBy="scannerRecipientLabel"
        placeholder={t('Address or payment code')} placeholderTextColor="#898994" value={entry}
        onChangeText={value => { invalidate(); setEntry(value); setError(''); }} multiline
        autoCorrect={false} spellCheck={false} autoCapitalize="none" textContentType="none" autoComplete="off" maxLength={16384} />
      {!!error && <Text style={styles.error} accessibilityRole="alert">{t(error)}</Text>}
      <TouchableOpacity style={[styles.primary, (!entry.trim() || checking) && styles.disabled]} accessibilityRole="button"
        disabled={!entry.trim() || checking} onPress={submitEntry}>
        {checking ? <ActivityIndicator color="#171108" /> : <Text style={styles.primaryText}>{t('Continue')}</Text>}
      </TouchableOpacity>
    </ScannerSheet>
  </View>;
}
