import { sanitizeNativeIntent } from '@/lib/native-intent';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return sanitizeNativeIntent(path);
}
