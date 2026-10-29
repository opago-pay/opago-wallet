import React, { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useWalletMotion } from '@/hooks/useWalletMotion';
import { subscribeFirstPaymentFeedback } from '@/lib/first-payment-feedback';

const COLORS = ['#FFB000', '#FFE081', '#FFFFFF', '#26B9B1', '#F47D59'];
const PARTICLES = Array.from({ length: 22 }, (_, index) => ({
  id: index, x: ((index * 37) % 100) / 100, drift: ((index * 53) % 100 - 50) * 2,
  delay: (index % 7) * 65, spin: index % 2 ? 460 : -420,
}));

function Particle({ index, x, drift, delay, spin, width }: {
  index: number; x: number; drift: number; delay: number; spin: number; width: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1400 + delay, easing: Easing.out(Easing.cubic) });
  }, [progress, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.8, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [-36 - delay / 4, 440]) },
      { translateX: interpolate(progress.value, [0, 1], [0, drift]) },
      { rotate: `${progress.value * spin}deg` },
    ],
  }));
  return <Animated.View style={[styles.piece, { left: x * width, backgroundColor: COLORS[index % COLORS.length],
    width: index % 3 === 0 ? 9 : 6, height: index % 3 === 0 ? 15 : 10 }, style]} />;
}

/** Purely decorative, pointer-transparent; disabled by the device motion preference. */
export function FirstPaymentConfetti() {
  const motionAllowed = useWalletMotion();
  const [event, setEvent] = useState<{ kind: string; id: number } | null>(null);
  const { width } = useWindowDimensions();
  useEffect(() => subscribeFirstPaymentFeedback(setEvent), []);
  useEffect(() => {
    if (!event) return;
    const timeout = setTimeout(() => setEvent(current => current?.id === event.id ? null : current), 2200);
    return () => clearTimeout(timeout);
  }, [event]);
  if (!motionAllowed || !event) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={styles.overlay}>
    {PARTICLES.map(p => <Particle key={event.id + ':' + p.id} index={p.id} x={p.x}
      drift={p.drift} delay={p.delay} spin={p.spin} width={width} />)}
  </View>;
}
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', zIndex: 100, elevation: 100 },
  piece: { position: 'absolute', top: '24%', borderRadius: 2 },
});
