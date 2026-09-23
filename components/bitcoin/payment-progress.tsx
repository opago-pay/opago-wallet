import { adaptiveStyles } from '@/lib/theme-styles';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AssetIcon } from '@/components/ui/asset-icon';
import { BitcoinSendScreen } from './send-sheet';
import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';

export type BitcoinPaymentPhase = 'authorizing' | 'sending' | 'success';

/** Presentation follows the actual authorization/SDK result, never a simulated timer. */
export function BitcoinPaymentProgress(props: { phase: BitcoinPaymentPhase; amountSats: number; footer?: ReactNode; children?: ReactNode; onBack?(): void }) {
  useLanguage();
  const [reduceMotion, setReduceMotion] = useState(true);
  const rotation = useRef(new Animated.Value(0)).current;
  const success = props.phase === 'success';
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    rotation.setValue(0);
    if (reduceMotion || success) return;
    const animation = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, rotation, success]);
  const heading = t(success ? 'Bitcoin sent' : props.phase === 'authorizing' ? 'Confirm on your device' : 'Sending Bitcoin…');
  return <BitcoinSendScreen loading={!success} onBack={props.onBack} footer={props.footer}>
    <View style={styles.content}>
      <View style={styles.hero} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.halo, success && styles.successHalo]} />
        <Animated.View style={[styles.orbit, success && styles.successOrbit, {
          transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }]} />
        <View style={[styles.center, success && styles.successCenter]}>
          {success ? <Ionicons name="checkmark" size={64} color="#87ddbd" /> : <AssetIcon asset="bitcoin" size={70} />}
        </View>
      </View>
      <View style={styles.summary} accessible accessibilityLiveRegion="polite" accessibilityState={{ busy: !success }}>
        <Text accessibilityRole="header" style={styles.heading}>{heading}</Text>
        <Text style={styles.amount}>{props.amountSats.toLocaleString(appLocale())} SAT</Text>
        <Text style={styles.note}>{t(success ? 'Payment confirmed' : props.phase === 'authorizing' ? 'Approve this payment with your device.' : 'Please wait. Do not send again.')}</Text>
      </View>
      {props.children}
    </View>
  </BitcoinSendScreen>;
}

const styles = adaptiveStyles(StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 32, paddingVertical: 32 },
  hero: { width: 224, height: 224, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 224, height: 224, borderRadius: 112, backgroundColor: '#ffb00008', borderWidth: 1, borderColor: '#ffb0000e' },
  orbit: { position: 'absolute', width: 182, height: 182, borderRadius: 91, borderWidth: 2, borderColor: '#ffb00016', borderTopColor: '#ffb000', borderRightColor: '#ffb00070' },
  center: { width: 126, height: 126, borderRadius: 63, backgroundColor: '#1d190f', alignItems: 'center', justifyContent: 'center' },
  successHalo: { backgroundColor: '#87ddbd08', borderColor: '#87ddbd10' },
  successOrbit: { borderColor: '#87ddbd38', borderTopColor: '#87ddbd38', borderRightColor: '#87ddbd38' },
  successCenter: { backgroundColor: '#132820' },
  summary: { gap: 12, alignItems: 'center', width: '100%' },
  heading: { color: '#fafaf7', fontSize: 27, fontWeight: '600', textAlign: 'center', letterSpacing: -0.5 },
  amount: { color: '#fafaf7', fontSize: 38, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] },
  note: { color: '#a6a6ad', fontSize: 15, lineHeight: 22, textAlign: 'center' },
}));
