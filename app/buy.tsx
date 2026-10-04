import { Redirect } from 'expo-router';

// Preserve old saved links without exposing an unavailable purchase flow.
export default function BuyRedirect() {
  return <Redirect href="/(tabs)" />;
}
