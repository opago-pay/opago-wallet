import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { initializeCrashReporting, stopCrashReporting } from './crash-reporting';

const storageKey = 'opago.crash-diagnostics-consent.v1';
type Snapshot = { ready: boolean; granted: boolean };
type NativeConsent = { read(): Promise<boolean>; setEnabled(enabled: boolean): Promise<void> };

class DiagnosticsConsent {
  private snapshot: Snapshot = { ready: false, granted: false };
  private listeners = new Set<() => void>();
  private initialization: Promise<void> | null = null;
  private saving: Promise<void> = Promise.resolve();

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      let granted = false;
      try {
        if (Platform.OS === 'ios') {
          // iOS uses the same native preference that gates the pre-JS crash handler.
          granted = (await (NativeModules.OpagoNativeCrashConsent as NativeConsent | undefined)?.read()) === true;
        } else if (Platform.OS === 'android') {
          granted = (await AsyncStorage.getItem(storageKey)) === 'granted';
        }
      } catch { /* Unreadable consent always means diagnostics stay off. */ }
      this.publish({ ready: true, granted });
      if (granted) initializeCrashReporting(__DEV__, Platform.OS);
    })();
    return this.initialization;
  }

  setGranted(granted: boolean): Promise<void> {
    const save = this.saving.catch(() => undefined).then(async () => {
      await this.initialize();
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
      if (granted === this.snapshot.granted) return;
      if (granted) {
        if (Platform.OS === 'ios') {
          const native = NativeModules.OpagoNativeCrashConsent as NativeConsent | undefined;
          if (!native) throw new Error('Native diagnostics consent is unavailable.');
          await native.setEnabled(true);
        } else {
          await AsyncStorage.setItem(storageKey, 'granted');
        }
        this.publish({ ready: true, granted: true });
        initializeCrashReporting(__DEV__, Platform.OS);
      } else {
        // Stop collection before updating the saved choice. A failed save is visible
        // to the caller and must not silently report a successful withdrawal.
        if (Platform.OS === 'ios') {
          const native = NativeModules.OpagoNativeCrashConsent as NativeConsent | undefined;
          if (!native) throw new Error('Native diagnostics consent is unavailable.');
          await native.setEnabled(false);
          await stopCrashReporting();
        } else {
          await stopCrashReporting();
          await AsyncStorage.setItem(storageKey, 'declined');
        }
        this.publish({ ready: true, granted: false });
      }
    });
    this.saving = save;
    return save;
  }
}

export const diagnosticsConsent = new DiagnosticsConsent();
