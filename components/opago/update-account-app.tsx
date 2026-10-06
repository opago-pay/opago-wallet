import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { nativeF3UpdateUrl } from '../../lib/opago/settings-native';
import { Action, Copy } from './opago-ui';
import { t } from '../../lib/i18n';
export function UpdateAccountApp() {
  const [failed, setFailed] = useState(false);
  async function open() {
    try {
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new Error('Native app required.');
      await Linking.openURL(nativeF3UpdateUrl(Platform.OS)); setFailed(false);
    } catch { setFailed(true); }
  }
  return <><Action label="Update app" onPress={() => void open()} />
    {failed && <Copy warning>{t('The update link is unavailable. Contact OPAGO support for the current app version.')}</Copy>}</>;
}
