import type { ReactNativeOptions } from '@sentry/react-native';
import { diagnosticScreen, sanitizeCrashEvent } from './sentry-privacy';

// Public ingestion key, not an API or build-upload credential.
const dsn = 'https://87bcd96c65e4476e0f783d39cb5f4a86@o4512175942598656.ingest.de.sentry.io/4512175945154640';
let sdk: typeof import('@sentry/react-native') | undefined;
let attempted = false;

export function crashReportingOptions(platform = 'android'): ReactNativeOptions {
  return {
    dsn,
    debug: false,
    sendDefaultPii: false,
    sendClientReports: false,
    enableNative: true,
    // iOS starts before React Native with its own native privacy filter. Never
    // reinitialize it from JS: this would replace that filter with SDK defaults.
    autoInitializeNativeSdk: platform !== 'ios',
    enableNativeCrashHandling: platform === 'ios',
    enableNdk: false,
    enableNdkScopeSync: false,
    enableTombstone: false,
    enableMetricKit: false,
    enableMetricKitRawPayload: false,
    enableWatchdogTerminationTracking: false,
    enableAppHangTracking: false,
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: false,
    enableAppStartTracking: false,
    enableNativeFramesTracking: false,
    enableStallTracking: false,
    enableCaptureFailedRequests: false,
    enableNetworkBreadcrumbs: false,
    enableNetworkEventBreadcrumbs: false,
    enableAutoBreadcrumbTracking: false,
    enableActivityLifecycleBreadcrumbs: false,
    enableAppLifecycleBreadcrumbs: false,
    enableSystemEventBreadcrumbs: false,
    enableUserInteractionTracing: false,
    enableNativeNagger: false,
    enableTurboModuleTracking: false,
    enableLogs: false,
    enableAutoConsoleLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    attachThreads: false,
    attachAllThreads: false,
    maxBreadcrumbs: 0,
    maxCacheItems: 10,
    maxQueueSize: 10,
    patchGlobalPromise: false,
    shutdownTimeout: 500,
    tracePropagationTargets: [],
    beforeBreadcrumb: () => null,
    beforeSend: (event, hint) => {
      hint.attachments = [];
      return sanitizeCrashEvent(event);
    },
    beforeSendTransaction: () => null,
    integrations: defaults => defaults.filter(integration => new Set([
      'ReactNativeErrorHandlers', 'Release', 'EventOrigin', 'SdkInfo',
      'ReactNativeInfo', 'RewriteFrames', 'DebugMeta', 'DeviceContext', 'Dedupe',
    ]).has(integration.name)),
  };
}

/** Optional diagnostics: no awaited initialization, connectivity test or login. */
export function initializeCrashReporting(development: boolean, platform: string): void {
  if (attempted || development || platform === 'web' || process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'false') return;
  attempted = true;
  const errorUtils = (globalThis as typeof globalThis & {
    ErrorUtils?: { getGlobalHandler(): (error: Error, fatal?: boolean) => void; setGlobalHandler(handler: (error: Error, fatal?: boolean) => void): void };
  }).ErrorUtils;
  let originalHandler: ReturnType<NonNullable<typeof errorUtils>['getGlobalHandler']> | undefined;
  try {
    originalHandler = errorUtils?.getGlobalHandler();
    // A missing/broken native SDK must not prevent the wallet from starting.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: typeof import('@sentry/react-native') = require('@sentry/react-native');
    loaded.init(crashReportingOptions(platform));
    sdk = loaded;
  } catch {
    attempted = false;
    // Undo a partially installed error handler if initialization fails.
    try { if (originalHandler) errorUtils?.setGlobalHandler(originalHandler); }
    catch { /* Keep the original startup failure isolated from the wallet. */ }
  }
}

export async function stopCrashReporting(): Promise<void> {
  const current = sdk;
  sdk = undefined;
  attempted = false;
  try {
    // Disable new envelopes immediately; close may still finish events queued
    // before withdrawal.
    const options = current?.getClient()?.getOptions();
    if (options) options.enabled = false;
    await current?.close();
  }
  catch { /* Withdrawal must not interrupt the wallet. */ }
}

export function recordDiagnosticScreen(segments: readonly string[]): void {
  try { sdk?.setTag('screen', diagnosticScreen(segments)); }
  catch { /* Diagnostics cannot interrupt navigation. */ }
}

/** Opt-in release-build controls; never called automatically or by a deep link. */
export function nativeCrashTestEnabled(development: boolean, platform: string): boolean {
  return !development && platform === 'ios' && process.env.EXPO_PUBLIC_SENTRY_ENABLED !== 'false' &&
    process.env.EXPO_PUBLIC_SENTRY_TEST_CONTROLS === 'true';
}

export function triggerNativeCrashTest(development: boolean, platform: string): boolean {
  if (!nativeCrashTestEnabled(development, platform) || !sdk) return false;
  try {
    sdk.setTag('diagnostic_test', 'native');
    sdk.nativeCrash(); // The next app launch uploads the filtered crash report.
    return true;
  } catch {
    return false;
  }
}
