import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  useLanguage();
  return (
    <Tabs
      initialRouteName="index"
      backBehavior="initialRoute"
      tabBar={() => null}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('Home'),
        }}
      />
      <Tabs.Screen
        name="send"
        options={{
          title: t('Send'),
        }}
      />
      <Tabs.Screen
        name="receive"
        options={{
          title: t('Receive'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('Security'),
        }}
      />
    </Tabs>
  );
}
