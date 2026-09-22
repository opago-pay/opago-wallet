import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, Keyboard, Modal, Platform, ScrollView, Text, useWindowDimensions, View, type KeyboardEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableOpacity, WalletActivityBoundary } from '@/components/ui/wallet-interaction';
import { t } from '@/lib/i18n';
import { scannerStyles as styles } from './scanner-styles';
import { modalKeyboardInset } from '@/lib/keyboard-inset';

export function ScannerSheet(props: { visible: boolean; onClose(): void; onShow?(): void; title: string; compact?: boolean; hideClose?: boolean; dismissDisabled?: boolean; footer?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [viewportHeight, setViewportHeight] = useState(height);
  const [keyboardFrame, setKeyboardFrame] = useState<{ screenY: number; height: number } | null>(null);
  const title = useRef<Text>(null);
  useEffect(() => {
    if (!props.visible) { setKeyboardFrame(null); return; }
    setKeyboardFrame(Keyboard.metrics() ?? null);
    const update = (event: KeyboardEvent) => {
      if (!reduceMotion && event.duration > 0) Keyboard.scheduleLayoutAnimation(event);
      setKeyboardFrame(event.endCoordinates);
    };
    const hide = (event: KeyboardEvent) => {
      if (!reduceMotion && event.duration > 0) Keyboard.scheduleLayoutAnimation(event);
      setKeyboardFrame(null);
    };
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', update);
    const hidden = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', hide);
    return () => { show.remove(); hidden.remove(); };
  }, [props.visible, reduceMotion]);
  const keyboardInset = modalKeyboardInset(viewportHeight, keyboardFrame);
  useEffect(() => {
    let current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (current) setReduceMotion(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { current = false; listener.remove(); };
  }, []);
  return <Modal transparent visible={props.visible} animationType={reduceMotion ? 'none' : 'slide'}
    statusBarTranslucent navigationBarTranslucent onRequestClose={() => { if (!props.dismissDisabled) props.onClose(); }}
    onShow={() => {
      const handle = findNodeHandle(title.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      // Native Android dialogs attach after their children first render. Focus
      // the input only once the modal window is actually ready for the keyboard.
      props.onShow?.();
    }}>
    <WalletActivityBoundary style={[styles.modalRoot, { paddingBottom: keyboardInset }]}
      onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}>
        <View style={[styles.sheet, { maxHeight: Math.max(1, viewportHeight - keyboardInset - insets.top - 12), paddingBottom: keyboardFrame ? 12 : Math.max(insets.bottom, 20) }]}
          accessibilityViewIsModal importantForAccessibility="yes">
          <View style={styles.handle} accessible={false} />
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <Text ref={title} accessibilityRole="header" style={props.compact ? styles.eyebrow : styles.sheetTitle}>{props.title}</Text>
              {!props.compact && !props.hideClose && <TouchableOpacity style={styles.circle} accessibilityRole="button" accessibilityLabel={t('Close entry')} disabled={props.dismissDisabled} onPress={props.onClose}>
                <Ionicons name="close" size={21} color="#eeeef1" />
              </TouchableOpacity>}
            </View>
            {props.children}
          </ScrollView>
          {props.footer && <View style={{ paddingHorizontal: 23, paddingTop: 16 }}>{props.footer}</View>}
        </View>
    </WalletActivityBoundary>
  </Modal>;
}
