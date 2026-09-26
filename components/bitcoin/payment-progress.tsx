import { adaptiveStyles, themeColor } from '@/lib/theme-styles';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AssetIcon } from '@/components/ui/asset-icon';
import { BitcoinSendScreen } from './send-sheet';
import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useColorMode } from '@/hooks/useColorMode';
import { useWalletMotion } from '@/hooks/useWalletMotion';

export type BitcoinPaymentPhase = 'authorizing' | 'sending' | 'success';

/** Presentation follows the actual authorization/SDK result, never a simulated timer. */
export function BitcoinPaymentProgress(props: { phase: BitcoinPaymentPhase; amountSats: number; footer?: ReactNode; children?: ReactNode; onBack?(): void }) {
  useLanguage();
  useColorMode();
  const { width } = useWindowDimensions();
  const motionAllowed = useWalletMotion();
  const rotation = useRef(new Animated.Value(0)).current;
  const success = props.phase === 'success';
  useEffect(() => {
    rotation.setValue(0);
    if (!motionAllowed || success) return;
    const animation = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false }));
    animation.start();
    return () => animation.stop();
  }, [motionAllowed, rotation, success]);
  const moving = motionAllowed && !success;
  const heading = t(success ? 'Bitcoin sent' : props.phase === 'authorizing' ? 'Confirm on your device' : 'Sending Bitcoin…');
  return <BitcoinSendScreen loading={!success} onBack={props.onBack} footer={props.footer}>
    <View style={styles.content}>
      <View style={[styles.hero, success && styles.successHero]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.halo, success && styles.successHalo, moving && {
          opacity: rotation.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 1, 0.45] }),
          transform: [{ scale: rotation.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 1.04, 0.9] }) }],
        }]} />
        <Animated.View style={[styles.orbit, success && styles.successOrbit, {
          transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }]} />
        <Animated.View style={[styles.center, success && styles.successCenter, moving && {
          transform: [
            { translateY: rotation.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -5, -8, -5, 0] }) },
            { rotate: rotation.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-5deg', '5deg', '-5deg'] }) },
          ],
        }]}>
          {success ? <Ionicons name="checkmark" size={50} color={themeColor('successText')} /> : <AssetIcon asset="bitcoin" size={70} />}
        </Animated.View>
      </View>
      <View style={styles.summary} accessible accessibilityLiveRegion="polite" accessibilityState={{ busy: !success }}>
        <Text accessibilityRole="header" style={[styles.heading, width < 360 && styles.headingCompact]}>{heading}</Text>
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
  orbit: { position: 'absolute', width: 182, height: 182, borderRadius: 91, borderWidth: 3, borderColor: '#ffb00016', borderTopColor: '#ffb000', borderRightColor: '#ffb00070' },
  center: { width: 126, height: 126, borderRadius: 63, backgroundColor: '#1d190f', alignItems: 'center', justifyContent: 'center' },
  successHero: { width: 132, height: 132 },
  successHalo: { width: 132, height: 132, borderRadius: 66, backgroundColor: '#87ddbd08', borderColor: '#87ddbd10' },
  successOrbit: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: '#87ddbd38', borderTopColor: '#87ddbd38', borderRightColor: '#87ddbd38' },
  successCenter: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(73,209,125,0.16)' },
  summary: { gap: 12, alignItems: 'center', width: '100%' },
  heading: { color: '#fafaf7', fontSize: 28, lineHeight: 34, fontWeight: '600', textAlign: 'center', letterSpacing: -0.5 },
  headingCompact: { fontSize: 24, lineHeight: 30 },
  amount: { color: '#fafaf7', fontSize: 36, lineHeight: 44, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] },
  note: { color: '#a6a6ad', fontSize: 15, lineHeight: 22, textAlign: 'center' },
}));
