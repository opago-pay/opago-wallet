import { Redirect } from 'expo-router';

/** Historical links must never resurrect the native password/signup form. */
export default function OpagoSignupScreen() { return <Redirect href="/opago-account" />; }
