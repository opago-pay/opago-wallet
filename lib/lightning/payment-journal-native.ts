import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLightningPaymentJournal } from './payment-journal';

export const lightningPaymentJournal = createLightningPaymentJournal(AsyncStorage);
