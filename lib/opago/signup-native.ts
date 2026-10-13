import { nativeF3Settings } from './settings-native';
import { nativeHkaHttp } from './hka-http-native';
import { PublicSignupClient, SignupError, type SignupFields } from './signup';
import { nativePublicAccount } from './public-account-native';

export async function submitPrivateSignup(fields: SignupFields, language: string, signal: AbortSignal) {
  let origin: string;
  try {
    const settings = nativeF3Settings();
    if (!settings) throw new Error();
    origin = settings.audience;
    await nativePublicAccount().client.configuration(signal);
  } catch { throw new SignupError('unavailable'); }
  return new PublicSignupClient(origin, nativeHkaHttp).signup(fields, language, signal);
}
