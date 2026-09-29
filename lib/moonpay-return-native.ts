import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'opago:moonpay:pending-return';
const MAX_AGE_MS = 24 * 60 * 60_000;

// This is a navigation notice, not evidence that MoonPay completed a purchase.
// The public Hedera key scopes it to the wallet without storing checkout URLs.
export async function markMoonPayBrowserOpened(walletPublicKey: string): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ walletPublicKey, at: Date.now() }));
}

export async function consumeMoonPayReturnNotice(walletPublicKey: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return false;
  await AsyncStorage.removeItem(KEY);
  try {
    const value = JSON.parse(raw) as { walletPublicKey?: unknown; at?: unknown };
    return value.walletPublicKey === walletPublicKey && typeof value.at === 'number' &&
      value.at <= Date.now() && Date.now() - value.at <= MAX_AGE_MS;
  } catch { return false; }
}

export async function hasMoonPayReturnNotice(walletPublicKey: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as { walletPublicKey?: unknown; at?: unknown };
    return value.walletPublicKey === walletPublicKey && typeof value.at === 'number' &&
      value.at <= Date.now() && Date.now() - value.at <= MAX_AGE_MS;
  } catch { return false; }
}

export async function clearMoonPayReturnNotice(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
