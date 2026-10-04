import { useEffect, useRef } from 'react';
import { AccessibilityInfo, AppState, findNodeHandle, Text } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** Focus newly displayed headings, including views changed within one route. */
export function useAccessibleHeading(key: string, enabled = true) {
  const heading = useRef<Text>(null);
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused || !enabled) return;
    const timer = setTimeout(() => {
      if (AppState.currentState !== 'active') return;
      const handle = findNodeHandle(heading.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 250);
    return () => clearTimeout(timer);
  }, [key, enabled, focused]);
  return heading;
}
