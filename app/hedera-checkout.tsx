import { useRef } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function HederaCheckoutDeepLink() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const requestKey = useRef(Date.now().toString()).current;
  const query = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) query.append(key, value);
  }

  const request = 'opagowallet://hedera-checkout?' + query.toString();
  return (
    <Redirect
      href={{
        pathname: '/(tabs)/send',
        params: { hederaRequest: request, hederaRequestKey: requestKey },
      }}
    />
  );
}
