import type { ErrorEvent, StackFrame } from '@sentry/react-native';

const bundleNames = new Set(['app:///main.jsbundle', 'app:///index.android.bundle', 'app:///index.bundle']);
const errorTypes = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const screens = new Set(['home', 'send', 'receive', 'scan', 'settings', 'buy', 'deposits', 'authentication', 'other']);

// Free-form errors can contain a seed, invoice or server response. Keep only
// fixed classifications; source maps restore function names from bundle offsets.
function errorSummary(value: unknown): string {
  if (typeof value !== 'string') return 'Error details withheld';
  if (/^(?:TypeError: )?undefined is not a function$/.test(value)) return 'undefined is not a function';
  if (/^Maximum call stack size exceeded\.?$/.test(value)) return 'Maximum call stack size exceeded';
  if (/^Rendered (?:more|fewer) hooks than (?:expected|during the previous render)/.test(value)) return 'React hook order changed';
  if (/^Cannot (?:read|convert) (?:property|properties|undefined|null)/.test(value)) return 'Cannot access null or undefined';
  if (/is not a function/.test(value)) return 'Value is not callable';
  if (/^Network request failed$/.test(value)) return 'Network request failed';
  return 'Error details withheld';
}

function position(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < 1e9 ? value : undefined;
}

function cleanFrame(frame: StackFrame): StackFrame | null {
  if (!frame.filename || !bundleNames.has(frame.filename)) return null;
  return { filename: frame.filename, lineno: position(frame.lineno), colno: position(frame.colno), in_app: true };
}

/** Construct a new event instead of trying to redact arbitrary nested payloads. */
export function sanitizeCrashEvent(event: ErrorEvent): ErrorEvent | null {
  try {
    const values = event.exception?.values?.slice(0, 3).map(exception => ({
      type: errorTypes.has(exception.type ?? '') ? exception.type : 'Error',
      value: errorSummary(exception.value),
      stacktrace: { frames: (exception.stacktrace?.frames ?? []).slice(-60).map(cleanFrame).filter((frame): frame is StackFrame => frame !== null) },
      mechanism: {
        type: ['onerror', 'onunhandledrejection'].includes(exception.mechanism?.type ?? '') ? exception.mechanism!.type : 'generic',
        handled: exception.mechanism?.handled !== false,
      },
    }));
    if (!values?.length) return null;
    const clean: ErrorEvent = {
      type: undefined,
      platform: 'javascript',
      level: event.level === 'fatal' ? 'fatal' : 'error',
      exception: { values },
      // An explicit non-IP value also prevents automatic IP inference for this event.
      user: { ip_address: '0.0.0.0' },
      tags: { diagnostic_schema: '1' },
    };
    if (/^[0-9a-f]{32}$/i.test(event.event_id ?? '')) clean.event_id = event.event_id;
    if (typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)) clean.timestamp = event.timestamp;
    if (/^com\.opago\.wallet@\d+\.\d+\.\d+(?:\+\d+)?$/.test(event.release ?? '')) clean.release = event.release;
    if (/^\d{1,12}$/.test(String(event.dist ?? ''))) clean.dist = event.dist;
    clean.environment = 'production';
    const screen = event.tags?.screen;
    if (typeof screen === 'string' && screens.has(screen)) clean.tags!.screen = screen;
    const os = event.contexts?.os;
    if (os && ['iOS', 'Android'].includes(os.name ?? '')) {
      clean.contexts = { os: { name: os.name, ...(/^\d+(?:\.\d+){0,3}$/.test(os.version ?? '') ? { version: os.version } : {}) } };
    }
    const model = event.contexts?.device?.model;
    if (typeof model === 'string' && /^(?:iPhone|iPad)\d{1,2},\d{1,2}$/.test(model)) {
      clean.contexts = { ...clean.contexts, device: { model } };
    }
    const images = event.debug_meta?.images?.filter(image => image.type === 'sourcemap' &&
      'debug_id' in image && typeof image.debug_id === 'string' && uuid.test(image.debug_id) &&
      'code_file' in image && bundleNames.has(image.code_file ?? '')).slice(0, 2)
      .map(image => ({ type: 'sourcemap' as const, code_file: image.code_file!, debug_id: image.debug_id }));
    if (images?.length) clean.debug_meta = { images };
    return clean;
  } catch {
    return null; // A diagnostic failure must never affect the wallet or leak the original event.
  }
}

export function diagnosticScreen(segments: readonly string[]): string {
  if (segments.includes('(auth)')) return 'authentication';
  const last = segments[segments.length - 1];
  const names: Record<string, string> = { 'send-flow': 'send', send: 'send', 'receive-flow': 'receive', receive: 'receive', scan: 'scan', settings: 'settings', buy: 'buy', 'bitcoin-deposits': 'deposits', index: 'home', '(tabs)': 'home' };
  return names[last] ?? (segments.length === 0 ? 'home' : 'other');
}
