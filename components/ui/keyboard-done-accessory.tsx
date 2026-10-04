import { InputAccessoryView, Keyboard, Platform, Text, View } from 'react-native';
import { TouchableOpacity } from './wallet-interaction';
import { themeColor } from '@/lib/theme-styles';
import { useColorMode } from '@/hooks/useColorMode';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';

export function KeyboardDoneAccessory({ nativeID }: { nativeID: string }) {
  useColorMode();
  useLanguage();
  if (Platform.OS !== 'ios') return null;
  return <InputAccessoryView nativeID={nativeID} backgroundColor={themeColor('surface')}>
    <View style={{ alignItems: 'flex-end', borderTopWidth: 1, borderColor: themeColor('border') }}>
      <TouchableOpacity onPress={Keyboard.dismiss} accessibilityRole="button"
        style={{ minHeight: 44, minWidth: 64, paddingHorizontal: 20, paddingVertical: 12, justifyContent: 'center' }}>
        <Text style={{ color: themeColor('accentText'), fontSize: 17 }}>{t('Done')}</Text>
      </TouchableOpacity>
    </View>
  </InputAccessoryView>;
}
