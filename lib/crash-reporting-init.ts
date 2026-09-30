import { Platform } from 'react-native';
import { initializeCrashReporting } from './crash-reporting';

initializeCrashReporting(__DEV__, Platform.OS);
