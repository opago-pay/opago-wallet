import { OpagoError } from './api';
import type { F3Integration } from './runtime-native';
import { Platform } from 'react-native';
import { nativeBuildVersion } from 'expo-application';
import { getRandomValues } from 'expo-crypto';
import { createAccountBindingIntegration } from './binding-integration';
import { nativeHkaHttp, nativeOidcVerifierPorts } from './hka-http-native';
import { createWalletBrokerVerifier } from './oidc-verifier';
import { nativeOidcPlatform } from './oidc-native';
import { nativeBrokerClientLogout } from './broker-account-native';
import { nativeF3Enabled } from './settings-native';
import { f3PrivateStore } from './store-native';
import { walletSession } from '../wallet-session';

/** Native wiring for the published F3 contract. Configuration establishes transport
 * trust only; account and wallet authority require authenticated API responses.
 */
export async function createNativeF3Integration(): Promise<F3Integration> {
  if (!nativeF3Enabled()) throw new OpagoError('wallet_integration_disabled');
  if (!['ios', 'android'].includes(Platform.OS) || !/^[1-9][0-9]*$/.test(nativeBuildVersion || '')) {
    throw new OpagoError('app_update_required');
  }
  return createAccountBindingIntegration({
    platform: Platform.OS as 'ios' | 'android', build: Number(nativeBuildVersion),
    http: nativeHkaHttp, store: f3PrivateStore,
    random: length => getRandomValues(new Uint8Array(length)),
    oidc: configuration => nativeOidcPlatform(createWalletBrokerVerifier(configuration.discovery, nativeOidcVerifierPorts)),
    logout: nativeBrokerClientLogout, assertCurrent: walletSession.captureRuntime(),
  });
}
