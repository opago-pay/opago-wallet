import { Redirect } from 'expo-router';
/** Historical deep links cannot start the retired photo intake. */
export default function IdentityScreen() { return <Redirect href="/opago-signup" />; }
