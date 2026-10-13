import type { HkaHttp } from './hka';
import { parseStrictJson, utf8, validUnicode } from './encoding';

export type SignupFields = { email: string; phone: string; password: string };
export type SignupResult = { status: 'created' | 'resumed'; account_state: 'active'; email_verification: 'pending' | 'confirmed' | 'not_required' };
export const emptySignup = (): SignupFields => ({ email: '', phone: '', password: '' });
export function validateSignup(fields: SignupFields): Partial<Record<keyof SignupFields, string>> {
  const errors: Partial<Record<keyof SignupFields, string>> = {};
  const email = fields.email.trim().toLowerCase();
  if (Array.from(email).length > 320 || !validUnicode(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  // Confirmed E.164 contract. Do not guess a country or silently rewrite a number.
  if (!/^\+[1-9]\d{1,14}$/.test(fields.phone.trim())) errors.phone = 'Enter your mobile number with + and country code, using digits only.';
  // Published signup minimum, counted as Unicode characters like the API.
  // Additional realm policy stays server-authoritative. Never trim the password.
  if (!validUnicode(fields.password) || Array.from(fields.password).length < 8) errors.password = 'Use at least 8 characters for your password.';
  return errors;
}
/** No role, verification flag, wallet seed or possession proof comes from this form. */
export function preparePrivateSignup(fields: SignupFields) {
  if (Object.keys(validateSignup(fields)).length) throw new SignupError('invalid');
  return { username: fields.email.trim().toLowerCase(), phone: fields.phone.trim(),
    pw_signup: fields.password, customer_kind: 'private' as const };
}

// Local classifications, not API error codes. Never retain raw responses,
// credentials, exception causes or field values in errors/diagnostics.
export type SignupProblem = 'invalid' | 'closed' | 'conflict' | 'rateLimited' | 'unavailable' | 'unknown';
export class SignupError extends Error {
  constructor(readonly problem: SignupProblem, readonly retryAfterSeconds = 0) { super('OPAGO registration: ' + problem); }
}
export function signupErrorMessage(cause: unknown): string {
  switch (cause instanceof SignupError ? cause.problem : 'unknown') {
    case 'invalid': return 'Check your email, international phone number and password. The password must meet the account service requirements.';
    case 'closed': return 'Registration is currently closed. You can sign in to an existing account or continue using your wallet.';
    case 'conflict': return 'Registration could not be completed with these details. Try signing in or use password recovery in the sign-in window.';
    case 'rateLimited': return 'Too many attempts. Wait before continuing your registration.';
    case 'unavailable': return 'Registration is temporarily unavailable. Your account may already have been partly created.';
    default: return 'The registration result is unknown. Your account may already have been created.';
  }
}

/** Released public JSON contract (API #567), over the existing strict HTTP port.
 * No account mutation outbox: that would persist passwords and retry writes.
 * A repeat is only an explicit user action with the original details/password.
 */
export class PublicSignupClient {
  constructor(private readonly origin: string, private readonly http: HkaHttp) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new SignupError('unavailable');
  }
  async signup(fields: SignupFields, language: string, signal?: AbortSignal): Promise<SignupResult> {
    const body = JSON.stringify({ ...preparePrivateSignup(fields), language: language === 'de' ? 'de' : 'en' });
    if (utf8(body).length > 16_384) throw new SignupError('invalid');
    try {
      if (signal?.aborted) throw new SignupError('unknown');
      const response = await this.http(this.origin + '/api/v2/user/signup', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body, signal, maxBytes: 16_384, timeoutMs: 10_000,
      });
      if (signal?.aborted || !/^application\/json(?:\s*;|$)/i.test(response.contentType) || utf8(response.body).length > 16_384) throw new SignupError('unknown');
      const data = parseStrictJson(response.body);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SignupError('unknown');
      const value = data as Record<string, unknown>;
      if (response.status === 201 && Object.keys(value).length === 3 &&
          ['created', 'resumed'].includes(value.status as string) && value.account_state === 'active' &&
          ['pending', 'confirmed', 'not_required'].includes(value.email_verification as string)) return value as SignupResult;
      if (response.status >= 200 && response.status < 300) throw new SignupError('unknown');
      const retry = /^[0-9]{1,10}$/.test(response.retryAfter || '') ? Number(response.retryAfter) : 0;
      // 404 also covers the public route boundary when SIGNUP_ENABLED is closed.
      if (response.status === 404) throw new SignupError('closed');
      if (response.status === 422) throw new SignupError('invalid');
      // All sanitized conflicts have identical UI; no additional account lookup.
      if (response.status === 409) throw new SignupError('conflict');
      if (response.status === 429) throw new SignupError('rateLimited', retry);
      if ([401, 403, 502, 503].includes(response.status)) throw new SignupError('unavailable', retry);
      throw new SignupError('unknown');
    } catch (cause) {
      if (cause instanceof SignupError) throw cause;
      throw new SignupError('unknown');
    }
  }
}
