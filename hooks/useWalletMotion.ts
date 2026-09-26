import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/** Decorative motion is opt-in after reading the device preference, and pauses in the background. */
export function useWalletMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true;
      setReduced(value);
    });
    const activity = AppState.addEventListener('change', state => setActive(state === 'active'));
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !preferenceChanged) setReduced(value);
    }).catch(() => undefined);
    return () => { mounted = false; motion.remove(); activity.remove(); };
  }, []);
  return active && !reduced;
}
