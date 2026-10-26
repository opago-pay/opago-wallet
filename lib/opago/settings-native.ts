import { PUBLIC_API_ORIGIN } from './public-account-origin';
/** Release opt-in only; service configuration is fetched at runtime from the API. */
export function nativeF3Enabled() { return process.env.EXPO_PUBLIC_OPAGO_F3_ENABLED === 'true'; }
export function nativeF3Settings() {
  if (!nativeF3Enabled()) return null;
  return { audience: PUBLIC_API_ORIGIN };
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
