import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

/** Short entrance only: no springs, loops or animation of sensitive words. */
export function SettingsTransition({ screen, children }: PropsWithChildren<{ screen: string }>) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const progress = useRef(new Animated.Value(1)).current;
  const previousScreen = useRef(screen);

  useEffect(() => {
    let current = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (current && !changed) setReduceMotion(value); })
      .catch(() => undefined);
    return () => { current = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    const switched = previousScreen.current !== screen;
    previousScreen.current = screen;
    progress.stopAnimation();
    if (reduceMotion || !switched) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [screen, reduceMotion, progress]);

  return <Animated.View style={{
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }),
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  }}>{children}</Animated.View>;
}
