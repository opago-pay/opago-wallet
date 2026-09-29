// A bounded, in-memory trace for user-initiated support reports. Callers may
// provide only these fixed labels; never pass a key, address or error message.
export type AuthDiagnosticEvent =
  | 'startup.storage_check.begin' | 'startup.storage_check.wallet_found'
  | 'startup.storage_check.empty' | 'startup.storage_check.failed'
  | 'startup.provider_failed'
  | 'app.active' | 'app.inactive' | 'app.background'
  | 'unlock.begin' | 'unlock.success' | 'unlock.failed'
  | 'device_auth.begin' | 'device_auth.prompt' | 'device_auth.approved'
  | 'device_auth.rejected' | 'device_auth.wait_foreground' | 'device_auth.foreground'
  | 'device_auth.failed'
  | 'mnemonic_read.begin' | 'mnemonic_read.protected' | 'mnemonic_read.legacy'
  | 'mnemonic_read.missing' | 'mnemonic_read.failed'
  | 'wallet_startup.failed'
  | 'recovery_reveal.begin' | 'recovery_reveal.success' | 'recovery_reveal.failed';

export type AuthFailureCategory = 'cancelled' | 'background' | 'biometric' | 'keychain' | 'timeout' | 'unknown';
type Entry = { at: string; sinceStartMs: number; event: AuthDiagnosticEvent; category?: AuthFailureCategory };
const allowedEvents = new Set<AuthDiagnosticEvent>([
  'startup.storage_check.begin', 'startup.storage_check.wallet_found', 'startup.storage_check.empty',
  'startup.storage_check.failed', 'startup.provider_failed',
  'app.active', 'app.inactive', 'app.background',
  'unlock.begin', 'unlock.success', 'unlock.failed',
  'device_auth.begin', 'device_auth.prompt', 'device_auth.approved', 'device_auth.rejected',
  'device_auth.wait_foreground', 'device_auth.foreground', 'device_auth.failed',
  'mnemonic_read.begin', 'mnemonic_read.protected', 'mnemonic_read.legacy',
  'mnemonic_read.missing', 'mnemonic_read.failed', 'wallet_startup.failed',
  'recovery_reveal.begin', 'recovery_reveal.success', 'recovery_reveal.failed',
]);
const allowedCategories = new Set<AuthFailureCategory>(['cancelled', 'background', 'biometric', 'keychain', 'timeout', 'unknown']);
const started = Date.now();
const entries: Entry[] = [];

export function categorizeAuthFailure(cause: unknown): AuthFailureCategory {
  const message = cause instanceof Error ? cause.message : '';
  if (/cancel|dismiss|user_cancel/i.test(message)) return 'cancelled';
  if (/background|foreground|left Opago|Return to Opago/i.test(message)) return 'background';
  if (/biometr|face.?id|fingerprint|authentication/i.test(message)) return 'biometric';
  if (/keychain|secure.?stor|recovery phrase|decrypt/i.test(message)) return 'keychain';
  if (/timed? ?out|deadline/i.test(message)) return 'timeout';
  return 'unknown';
}

export function recordAuthDiagnostic(event: AuthDiagnosticEvent, category?: AuthFailureCategory): void {
  if (!allowedEvents.has(event) || (category && !allowedCategories.has(category))) return;
  const at = Date.now();
  entries.push({ at: new Date(at).toISOString(), sinceStartMs: Math.max(0, at - started), event, ...(category ? { category } : {}) });
  if (entries.length > 160) entries.shift();
}

export function getAuthDiagnosticReport(): string {
  return JSON.stringify({ schema: 1, scope: 'authentication-only', generatedAt: new Date().toISOString(), entries }, null, 2);
}
