import { AppState, Platform } from 'react-native';
import { nativeBuildVersion } from 'expo-application';
import * as WebBrowser from 'expo-web-browser';
import { nativeHkaHttp } from './hka-http-native';
import { nativeF3Enabled } from './settings-native';
import { walletSession } from '../wallet-session';
import { RuntimeConfigClient } from './runtime-config';
import { websiteAccountAvailability } from './website-account-config';
import { createWebsiteBrowser } from './website-browser';
import { WebsiteAccountError, WebsiteAccountFlow } from './website-account';

const browser = createWebsiteBrowser({
  open: url => WebBrowser.openBrowserAsync(url),
  dismiss: async () => { if (Platform.OS === 'ios') await WebBrowser.dismissBrowser(); },
  state: () => AppState.currentState,
  subscribe: listener => { const subscription = AppState.addEventListener('change', listener); return () => subscription.remove(); },
}, walletSession);
const flow = new WebsiteAccountFlow(async signal => {
  if (!nativeF3Enabled() || !['ios', 'android'].includes(Platform.OS) || !/^\d+$/.test(nativeBuildVersion || '')) throw new WebsiteAccountError();
  const config = new RuntimeConfigClient(nativeHkaHttp, Platform.OS as 'ios' | 'android', Number(nativeBuildVersion));
  return websiteAccountAvailability(abort => config.configuration(abort), signal);
}, browser);
// Invalidate attempts without touching secure account storage or seeds.
walletSession.subscribe(() => flow.cancel());
export function nativeWebsiteAccount() { return flow; }
