import { Platform } from 'react-native';
import { nativeBuildVersion } from 'expo-application';
import { getRandomValues } from 'expo-crypto';
import { nativeHkaHttp } from './hka-http-native';
import { nativeF3Enabled } from './settings-native';
import { f3PrivateStore } from './store-native';
import { walletSession } from '../wallet-session';
import { PublicAccountClient, PublicAccountError } from './public-account';
import { PublicAccountSessionStore } from './public-account-session';

let sessions: PublicAccountSessionStore | undefined;
export function nativePublicAccount() {
  if (!nativeF3Enabled() || !['ios', 'android'].includes(Platform.OS) || !/^\d+$/.test(nativeBuildVersion || '')) throw new PublicAccountError('unavailable');
  sessions ||= new PublicAccountSessionStore(new PublicAccountClient(nativeHkaHttp, Platform.OS as 'ios' | 'android',
    Number(nativeBuildVersion), length => getRandomValues(new Uint8Array(length))), f3PrivateStore);
  return sessions;
}
walletSession.subscribe(() => sessions?.invalidate());
