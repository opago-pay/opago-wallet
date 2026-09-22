import { useEffect, useMemo } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { walletTabBarStyle } from '@/components/navigation/wallet-tab-style';

/** Hide navigation during scanning/payment sheets; restore it when leaving the flow. */
export function useScannerTabBar(hidden: boolean) {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const normalStyle = useMemo(() => walletTabBarStyle(bottom, fontScale), [bottom, fontScale]);
  useEffect(() => {
    if (!focused) return;
    navigation.setOptions({ tabBarStyle: hidden ? { display: 'none' } : normalStyle });
    return () => navigation.setOptions({ tabBarStyle: normalStyle });
  }, [focused, hidden, navigation, normalStyle]);
}
