import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBitcoinStore } from './store';
import { createDepositWatch } from './deposit-watch';
export const bitcoinStore = createBitcoinStore(AsyncStorage);
export const bitcoinDepositWatch = createDepositWatch(AsyncStorage);
