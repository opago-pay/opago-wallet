import AsyncStorage from '@react-native-async-storage/async-storage';
import { createOperationalHealthStore } from './operational-health';

export const operationalHealth = createOperationalHealthStore(AsyncStorage);
