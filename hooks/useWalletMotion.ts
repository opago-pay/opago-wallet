import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/** Keep foreground state distinct from the actual accessibility preference. */
export function useWalletMotionState(): { active: boolean; reduced: boolean | null } {
  // Unknown until the OS answers: never mistake an unresolved lookup for
  // an explicit reduced-motion preference and discard a claimed milestone.
  const [reduced, setReduced] = useState<boolean | null>(null);
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
  return { active, reduced };
}

/** Decorative motion is allowed only in foreground with reduced motion disabled. */
export function useWalletMotion(): boolean {
  const { active, reduced } = useWalletMotionState();
  return active && reduced === false;
}
