import AsyncStorage from '@react-native-async-storage/async-storage';
import { createHederaPaymentJournal } from './payment-journal';

export const hederaPaymentJournal = createHederaPaymentJournal(AsyncStorage);
