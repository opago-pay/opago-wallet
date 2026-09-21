const CHECKOUT_FIELDS = new Set(['network', 'contractId', 'merchant', 'merchantEvmAddress', 'amount', 'paymentId', 'requestNonce', 'expiresAt']);

// External links may open a review, never wallet creation, recovery or signing.
// Canonical ASCII fields also avoid passing malformed percent encodings to the router.
export function sanitizeNativeIntent(path: string): string {
  try {
    if (path.length > 4_096) return '/';
    if (path === '/' || path === '' || path === 'opagowallet://') return '/';
    const url = new URL(path, 'opagowallet://app');
    const checkout = url.hostname === 'hedera-checkout' && (!url.pathname || url.pathname === '/')
      || url.hostname === 'app' && url.pathname === '/hedera-checkout';
    if (url.protocol !== 'opagowallet:' || !checkout || url.username || url.password || url.port || url.hash) return '/';
    const clean = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if (!CHECKOUT_FIELDS.has(key) || clean.has(key) || !/^[a-zA-Z0-9.]+$/.test(value) || value.length > 128) return '/';
      clean.set(key, value);
    }
    if (clean.size !== CHECKOUT_FIELDS.size) return '/';
    return '/hedera-checkout?' + clean.toString();
  } catch {
    return '/';
  }
}
