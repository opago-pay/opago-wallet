import type { ViewStyle } from 'react-native';

export function walletTabBarStyle(bottomInset: number, fontScale: number): ViewStyle {
  return {
    backgroundColor: '#0c0e09', borderTopWidth: 1, borderTopColor: '#292d23', elevation: 0,
    height: 66 + Math.max(bottomInset, 8) + Math.max(0, fontScale - 1) * 14,
    paddingTop: 10, paddingBottom: Math.max(bottomInset, 8),
  };
}
