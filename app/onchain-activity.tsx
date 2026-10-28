import { Redirect } from 'expo-router';

/** Existing links lead to the same complete activity view as Home. */
export default function OnchainActivity() {
  return <Redirect href={{ pathname: '/(tabs)', params: { activity: 'all' } }} />;
}
