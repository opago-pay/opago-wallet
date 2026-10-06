import { Platform } from 'react-native';
import { nativeBuildVersion } from 'expo-application';
import { getRandomValues } from 'expo-crypto';
import { NativeHkaTransport } from './hka';
import { nativeHkaHttp, nativeOidcVerifierPorts } from './hka-http-native';
import { nativeF3Settings, nativeF3UpdateUrl } from './settings-native';
import { f3PrivateStore } from './store-native';
import { parseStrictJson } from './encoding';
import { discoverOidc, createOidcVerifier } from './oidc-verifier';
import { nativeOidcPlatform } from './oidc-native';
import { OidcAccountLogin } from './oidc';
import type { F3Integration } from './runtime-native';

/** Lazy opt-in initialization; local BTC/Lightning/HBAR use never depends on account services. */
export async function createNativeF3Integration(): Promise<F3Integration> {
  const settings = nativeF3Settings();
  if (!settings || !['ios', 'android'].includes(Platform.OS) || !/^\d+$/.test(nativeBuildVersion || '')) throw new Error('Native OPAGO integration is not configured.');
  nativeF3UpdateUrl(Platform.OS as 'ios' | 'android');
  const roots = parseStrictJson(settings.roots);
  if (!roots || typeof roots !== 'object' || Array.isArray(roots) || Object.values(roots).some(v => typeof v !== 'string')) throw new Error('Invalid pinned HPKE roots.');
  const hka = new NativeHkaTransport({ audience: settings.audience, roots: roots as Record<string, string>, platform: Platform.OS as 'ios' | 'android', build: Number(nativeBuildVersion),
    oidc: { issuer: settings.issuer, clientId: settings.clientId, redirectUri: settings.redirectUri } }, nativeHkaHttp, f3PrivateStore, n => getRandomValues(new Uint8Array(n)));
  await hka.configuration();
  const discovery = await discoverOidc(settings.issuer, nativeOidcVerifierPorts.json);
  const config = { issuer: settings.issuer, clientId: settings.clientId, redirectUri: settings.redirectUri,
    authorizationEndpoint: discovery.authorization_endpoint, tokenEndpoint: discovery.token_endpoint };
  const platform = nativeOidcPlatform(createOidcVerifier(discovery, settings.accessAudience, nativeOidcVerifierPorts));
  // Refresh trusted config before login and token exchange as well as protected API calls.
  const guarded = { ...platform, async browser(url: string, redirect: string) { await hka.configuration(); return platform.browser(url, redirect); },
    async token(url: string, form: URLSearchParams) { await hka.configuration(); return platform.token(url, form); } };
  return { hka, accountLogin: new OidcAccountLogin(config, { issuers: [settings.issuer], redirectUris: [settings.redirectUri], accessAudience: settings.accessAudience }, guarded, f3PrivateStore),
    publicAddressOrigin: settings.publicAddressOrigin };
}
