/** UI preparation only. No registration transport is installed in this release.
 * Compliance 58acba32 (#843 merged) still exposes administrator-only signup. It is not
 * authorization to send wallet credentials to that route or bypass account locks.
 */
export type SignupFields = { email: string; phone: string; password: string };
export const emptySignup = (): SignupFields => ({ email: '', phone: '', password: '' });
export const signupAvailable = false;
export function validateSignup(fields: SignupFields): Partial<Record<keyof SignupFields, string>> {
  const errors: Partial<Record<keyof SignupFields, string>> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) errors.email = 'Enter a valid email address.';
  // Confirmed E.164 contract. Do not guess a country or silently rewrite a number.
  if (!/^\+[1-9]\d{1,14}$/.test(fields.phone.trim())) errors.phone = 'Enter your mobile number with + and country code, using digits only.';
  // Published SignupRequest minimum; the full realm password policy remains
  // a release prerequisite. Do not trim or otherwise transform the password.
  if (fields.password.length < 8) errors.password = 'Use at least 8 characters for your password.';
  return errors;
}
/** Known legacy field names and declared private context, NOT an accepted MVP wire contract.
 * No role, verification flag, wallet seed or possession proof comes from this form.
 */
export function preparePrivateSignup(fields: SignupFields) {
  if (Object.keys(validateSignup(fields)).length) throw new Error('Invalid signup fields.');
  return { username: fields.email.trim().toLowerCase(), phone: fields.phone.trim(),
    pw_signup: fields.password, customer_kind: 'private' as const };
}
