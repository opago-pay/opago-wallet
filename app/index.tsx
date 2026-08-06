import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { hasStoredMnemonic } from '../lib/storage';
import { useWalletAuth } from '../hooks/useWalletAuth';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [hasWallet, setHasWallet] = useState(false);
  const { loadOrGenerateWallet } = useWalletAuth();

  useEffect(() => {
    let mounted = true;

    async function checkWallet() {
      try {
        const exists = await hasStoredMnemonic();
        if (exists) await loadOrGenerateWallet();
        if (mounted) setHasWallet(exists);
      } catch {
        if (mounted) setHasWallet(false);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void checkWallet();
    return () => {
      mounted = false;
    };
  }, [loadOrGenerateWallet]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0a0a0c',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color="#ffb000" />
      </View>
    );
  }

  return <Redirect href={hasWallet ? '/(tabs)' : '/(auth)/login'} />;
}
