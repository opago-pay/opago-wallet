import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { WalletTabIcon } from '@/components/navigation/wallet-tab-icon';

export default function TabLayout() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#ffb000',
        tabBarInactiveTintColor: '#969987',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#0c0e09',
          borderTopWidth: 1,
          borderTopColor: '#292d23',
          elevation: 0,
          height: 66 + Math.max(insets.bottom, 8) + Math.max(0, fontScale - 1) * 14,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: 3,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('Home'),
          tabBarIcon: ({ color }) => <WalletTabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="send"
        options={{
          title: t('Send'),
          tabBarIcon: ({ color }) => <WalletTabIcon name="send" color={color} />,
        }}
      />
      <Tabs.Screen
        name="receive"
        options={{
          title: t('Request'),
          tabBarIcon: ({ color }) => <WalletTabIcon name="request" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('Security'),
          tabBarIcon: ({ color }) => <WalletTabIcon name="security" color={color} />,
        }}
      />
    </Tabs>
  );
}
