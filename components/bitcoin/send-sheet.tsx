import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, BackHandler, findNodeHandle, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WalletActivityBoundary } from '@/components/ui/wallet-interaction';

/** An opaque payment screen; camera and scanner overlays are never mounted here. */
export function BitcoinSendScreen(props: { title?: string; loading?: boolean; onBack?(): void; footer?: ReactNode; children: ReactNode }) {
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const title = useRef<Text>(null);
  const { loading, onBack } = props;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!focused || !active) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!loading) onBack?.();
      return true;
    });
    return () => back.remove();
  }, [focused, active, loading, onBack]);
  useEffect(() => {
    if (!focused || !active) return;
    const handle = findNodeHandle(title.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [focused, active, props.title]);
  if (!focused || !active) return <View style={styles.screen} />;
  return <WalletActivityBoundary style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) }]}>
    {!!props.title && <Text ref={title} accessibilityRole="header" style={styles.title}>{props.title}</Text>}
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {props.children}
    </ScrollView>
    {props.footer && <View style={styles.footer}>{props.footer}</View>}
  </WalletActivityBoundary>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#09090b' },
  title: { color: '#fafaf7', fontSize: 29, fontWeight: '600', letterSpacing: -0.6, paddingHorizontal: 24, marginBottom: 24 },
  scroll: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 16 },
  footer: { paddingHorizontal: 24, paddingTop: 16, backgroundColor: '#09090b' },
});
