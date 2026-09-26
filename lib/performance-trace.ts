/** Local, opt-in timing diagnostics. Never pass wallet data or error messages. */
const STAGES = [
  'ui.tap_to_handler', 'ui.handler', 'ui.event_loop_delay',
  'nav.home', 'nav.send', 'nav.receive', 'nav.settings', 'nav.buy',
  'wallet.device_unlock', 'wallet.secure_read', 'wallet.seed_derivation', 'wallet.spark_initialize',
  'balance.spark', 'balance.hedera', 'rates.fetch',
  'history.page', 'history.local', 'history.spark', 'history.hedera',
  'bitcoin.store', 'bitcoin.provider-restore', 'bitcoin.withdrawals', 'bitcoin.deposits', 'bitcoin.receipts',
  'receive.restore', 'receive.restore_storage', 'receive.create_invoice', 'receive.spark_invoice',
  'receive.invoice_persist', 'receive.qr_render', 'receive.qr_visible', 'receive.switch_to_qr',
  'receive.status', 'receive.payment_detected', 'receive.confirm_to_screen', 'receive.onchain_address',
  'scanner.permission', 'scanner.recognize', 'scanner.clipboard',
  'send.prepare', 'send.submit', 'buy.config', 'buy.address',
] as const;

export type PerformanceStage = typeof STAGES[number];
type Outcome = 'ok' | 'error' | 'cancelled';
type Entry = { at: number; stage: PerformanceStage; durationMs: number; outcome: Outcome };
const allowed = new Set<string>(STAGES);
const entries: Entry[] = [];
const pending: Entry[] = [];
const navigation = new Map<'home' | 'send' | 'receive' | 'settings' | 'buy', number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function performanceTracingEnabled() {
  return process.env.EXPO_PUBLIC_PERF_TRACE === 'true';
}

function now() { return performance.now(); }

export function recordPerformanceDuration(stage: PerformanceStage, durationMs: number, outcome: Outcome = 'ok') {
  if (!performanceTracingEnabled() || !allowed.has(stage) || !Number.isFinite(durationMs)) return;
  const entry: Entry = { at: Date.now(), stage, durationMs: Math.max(0, Math.round(durationMs)), outcome };
  entries.push(entry);
  if (entries.length > 500) entries.shift();
  pending.push(entry);
  // One delayed log batch cannot itself add a visible pause to a button press.
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const batch = pending.splice(0, pending.length);
    if (batch.length) try { console.info('OPAGO_PERF ' + JSON.stringify(batch)); } catch { /* Diagnostics are optional. */ }
  }, 1_000);
}

export function beginPerformanceSpan(stage: PerformanceStage): (outcome?: Outcome) => void {
  if (!performanceTracingEnabled()) return () => {};
  const started = now();
  let finished = false;
  return (outcome = 'ok') => {
    if (finished) return;
    finished = true;
    recordPerformanceDuration(stage, now() - started, outcome);
  };
}

export async function measurePerformance<T>(stage: PerformanceStage, work: () => Promise<T>): Promise<T> {
  const finish = beginPerformanceSpan(stage);
  try { const value = await work(); finish(); return value; }
  catch (cause) { finish('error'); throw cause; }
}

type Route = 'home' | 'send' | 'receive' | 'settings' | 'buy';
export function markNavigationStart(route: Route) {
  if (performanceTracingEnabled()) navigation.set(route, now());
}
export function markNavigationReady(route: Route) {
  const started = navigation.get(route);
  if (started === undefined) return;
  navigation.delete(route);
  recordPerformanceDuration(`nav.${route}`, now() - started);
}

export function startEventLoopMonitor(isActive: () => boolean): () => void {
  if (!performanceTracingEnabled()) return () => {};
  let previous = now();
  let lastRecorded = 0;
  const timer = setInterval(() => {
    const current = now();
    const delay = current - previous - 500;
    previous = current;
    if (isActive() && delay >= 250 && current - lastRecorded >= 2_000) {
      lastRecorded = current;
      recordPerformanceDuration('ui.event_loop_delay', delay);
    }
  }, 500);
  return () => clearInterval(timer);
}

export function getPerformanceReport() {
  return JSON.stringify({ version: 1, entries }, null, 2);
}
