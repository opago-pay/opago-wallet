import { useEffect } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';

/** Announce status changes on iOS, where accessibilityLiveRegion is unavailable. */
export function useAccessibleStatus(message: string | null, enabled = true) {
  useEffect(() => {
    if (!enabled || !message || Platform.OS !== 'ios') return;
    let announced = false;
    const announce = () => {
      if (announced || AppState.currentState !== 'active') return;
      announced = true;
      AccessibilityInfo.announceForAccessibility(message);
    };
    // Let the new content mount before announcing; cancel stale changes.
    const timer = setTimeout(announce, 250);
    const subscription = AppState.addEventListener('change', announce);
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [enabled, message]);
}
