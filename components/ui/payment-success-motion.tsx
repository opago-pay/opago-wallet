import React, { useCallback, useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { themeColor } from '@/lib/theme-styles';

export type SuccessExit = (action: () => void) => void;

function useSuccessMotion() {
  const progress = useRef<Animated.Value | null>(null);
  if (progress.current === null && Animated?.Value) progress.current = new Animated.Value(0);
  const motionEnabled = useRef(false);
  const exiting = useRef(false);

  useEffect(() => {
    const value = progress.current;
    if (!value || !AccessibilityInfo?.isReduceMotionEnabled) {
      value?.setValue(1);
      return;
    }
    let active = true;
    let entry: Animated.CompositeAnimation | null = null;
    const show = (reduced: boolean) => {
      if (!active || exiting.current) return;
      entry?.stop();
      motionEnabled.current = !reduced;
      if (reduced) {
        value.setValue(1);
        return;
      }
      value.setValue(0);
      entry = Animated.timing(value, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false,
      });
      entry.start();
    };
    const preference = AccessibilityInfo.addEventListener?.('reduceMotionChanged', show);
    void AccessibilityInfo.isReduceMotionEnabled().then(show).catch(() => {
      if (active) value.setValue(1);
    });
    return () => {
      active = false;
      entry?.stop();
      preference?.remove();
    };
  }, []);

  const exit = useCallback<SuccessExit>((action) => {
    const value = progress.current;
    if (exiting.current) return;
    exiting.current = true;
    if (!value || !motionEnabled.current || !Animated?.timing) {
      action();
      return;
    }
    Animated.timing(value, {
      toValue: 2,
      duration: 230,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
      isInteraction: false,
    }).start(() => action());
  }, []);

  const value = progress.current;
  return {
    exit,
    animatedStyle: value ? {
      opacity: value.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
      transform: [{ translateY: value.interpolate({ inputRange: [0, 1, 2], outputRange: [34, 0, 48] }) }],
    } : undefined,
    iconStyle: value ? {
      transform: [
        { translateY: value.interpolate({ inputRange: [0, 0.7, 1, 2], outputRange: [12, -4, 0, 8] }) },
        { scale: value.interpolate({ inputRange: [0, 0.7, 1, 2], outputRange: [0.82, 1.06, 1, 0.94] }) },
      ],
    } : undefined,
  };
}

const MotionView = (Animated?.View ?? View) as ComponentType<ViewProps>;
const MotionScrollView = (Animated?.ScrollView ?? ScrollView) as ComponentType<ScrollViewProps>;

export function PaymentSuccessMotionView({ children, ...props }:
  Omit<ViewProps, 'children'> & { children(exit: SuccessExit): ReactNode }) {
  const motion = useSuccessMotion();
  return <MotionView {...props} style={[props.style, motion.animatedStyle]}>{children(motion.exit)}</MotionView>;
}

export function PaymentSuccessMotionScrollView({ children, ...props }:
  Omit<ScrollViewProps, 'children'> & { children(exit: SuccessExit): ReactNode }) {
  const motion = useSuccessMotion();
  return <MotionScrollView {...props} style={[props.style, motion.animatedStyle]}>
    {children(motion.exit)}
  </MotionScrollView>;
}

export function PaymentSuccessIcon({ style, accessibilityLabel }: { style?: ViewProps['style']; accessibilityLabel?: string }) {
  const motion = useSuccessMotion();
  return <View style={[successStyles.iconSpace, style]} accessible={!!accessibilityLabel}
    accessibilityLabel={accessibilityLabel}>
    <MotionView style={[successStyles.circle, motion.iconStyle]}>
      <Ionicons name="checkmark" size={50} color={themeColor('successText')} />
    </MotionView>
  </View>;
}

const successStyles = StyleSheet.create({
  iconSpace: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(73,209,125,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(73,209,125,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
