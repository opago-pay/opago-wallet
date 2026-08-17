import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSolanaPaymentJournal } from './payment-journal';

export const solanaPaymentJournal = createSolanaPaymentJournal(AsyncStorage);
