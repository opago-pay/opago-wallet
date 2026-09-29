import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteSecureItem, getSecureItem, setSecureItem } from '../storage';
import { createLightningReceiveStore } from './receive-store';

export const lightningReceiveStore = createLightningReceiveStore({
  async getItem(key) {
    const protectedValue = await getSecureItem(key);
    if (protectedValue !== null) return protectedValue;
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue === null) return null;
    await setSecureItem(key, legacyValue);
    await AsyncStorage.removeItem(key);
    return legacyValue;
  },
  async setItem(key, value) {
    await setSecureItem(key, value);
    await AsyncStorage.removeItem(key);
  },
  async removeItem(key) {
    await Promise.all([
      deleteSecureItem(key),
      AsyncStorage.removeItem(key),
    ]);
  },
});
