/** Public, build-time trust configuration. Never put tokens, private keys or seeds here. */
export function nativeF3Enabled() { return process.env.EXPO_PUBLIC_OPAGO_F3_ENABLED === 'true'; }
export function nativeF3Settings() {
  if (!nativeF3Enabled()) return null;
  const settings = { audience: process.env.EXPO_PUBLIC_OPAGO_F3_API_ORIGIN || '', publicAddressOrigin: process.env.EXPO_PUBLIC_OPAGO_F3_ADDRESS_ORIGIN || '',
    issuer: process.env.EXPO_PUBLIC_OPAGO_F3_OIDC_ISSUER || '', clientId: process.env.EXPO_PUBLIC_OPAGO_F3_OIDC_CLIENT_ID || '',
    redirectUri: process.env.EXPO_PUBLIC_OPAGO_F3_OIDC_REDIRECT_URI || '', accessAudience: process.env.EXPO_PUBLIC_OPAGO_F3_OIDC_ACCESS_AUDIENCE || '',
    roots: process.env.EXPO_PUBLIC_OPAGO_F3_HPKE_ROOTS_JSON || '' };
  if (Object.values(settings).some(v => !v)) throw new Error('OPAGO account trust configuration is incomplete.'); return settings;
}
/** Operator-pinned distribution link; never take an update URL from an API error. */
export function nativeF3UpdateUrl(platform: 'ios' | 'android'): string {
  const raw = platform === 'ios' ? process.env.EXPO_PUBLIC_OPAGO_F3_IOS_UPDATE_URL : process.env.EXPO_PUBLIC_OPAGO_F3_ANDROID_UPDATE_URL;
  if (!raw) throw new Error('OPAGO update link is not configured.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port && url.port !== '443' ||
    !['opago.com', 'apps.apple.com', 'testflight.apple.com', 'play.google.com'].includes(url.hostname)) throw new Error('Invalid OPAGO update link.');
  return url.toString();
}
