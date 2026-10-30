import { useCallback } from 'react';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { BackHandler, Keyboard, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';

/** Return to the account entry screen, with a menu fallback for direct links. */
export function BackToSettings() {
  const router = useRouter();
  const navigation = useNavigation();
  useLanguage();
  const goBack = useCallback(() => {
    Keyboard.dismiss();
    const state = navigation.getState();
    let previousIndex = (state?.index ?? 0) - 1;
    // Child account flows can replace themselves with another account route.
    // Skip that contiguous duplicate history instead of revealing the same page.
    while (state?.routes[previousIndex]?.name === 'opago-account') previousIndex--;
    const previous = state?.routes[previousIndex];
    const priorTab = previous?.state?.routes[previous.state.index ?? 0]?.name;
    // Account can also be opened from Receive, POS linking or sync. Preserve
    // that real history, but don't send direct links to the synthetic home anchor.
    if (state && previous && (previous.name !== '(tabs)' || priorTab && priorTab !== 'index')) {
      const count = state.index - previousIndex;
      if (count === 1) router.back(); else router.dismiss(count);
    } else {
      // With an account-only deep-link stack there is no menu to pop to yet.
      // Remove duplicate accounts before replacing the final one with settings.
      if (state && previousIndex < 0 && state.index > 0) router.dismiss(state.index);
      router.dismissTo('/(tabs)/settings?section=overview');
    }
  }, [navigation, router]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]));
  return <TouchableOpacity onPress={goBack} accessibilityRole="button" accessibilityLabel={t('Back')}
    style={styles.button}>
    <Ionicons name="arrow-back" size={26} color={adaptColor('#fff', 'color')} />
  </TouchableOpacity>;
}

const styles = adaptiveStyles(StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1b1b20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
}));
