const stages = [
  'device_approval', 'bitcoin_balance', 'journal_pending', 'journal_result', 'proof_check',
  'sdk_send', 'fee_quote', 'leaves_select', 'leaves_renew', 'leaves_swap',
  'transfer_prepare', 'swap_prepare', 'transfer_claim', 'preimage_swap', 'local_transfer_update',
  'ssp_send', 'ssp_swap', 'ssp_auth', 'ssp_query', 'operator_client', 'operator_auth',
  'operator_query', 'operator_commitments', 'operator_transfer', 'operator_swap', 'operator_claim',
  'signer_public_key', 'signer_commitment', 'signer_frost', 'signer_aggregate', 'signer_key_tweak',
  'refund_signing', 'signing_jobs',
  'htlc_output', 'public_curve',
  'preimage_prepare',
] as const;
export type SendTimingStage = typeof stages[number];
const allowedStages = new Set<string>(stages);

type Span = { stage: SendTimingStage; startMs: number; endMs: number };
type Trace = { run: number; started: number; spans: Span[]; completed: boolean };
let active: Trace | null = null;
let sequence = 0;

export function sendTimingEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SEND_TIMING === 'true';
}

/** One explicit Send attempt; no arguments, wallet identifiers or errors are recorded. */
export function beginSendTiming(): () => void {
  if (!sendTimingEnabled() || active || sequence >= 1) return () => {};
  const trace: Trace = { run: ++sequence, started: performance.now(), spans: [], completed: false };
  active = trace;
  return () => {
    if (trace.completed) return;
    trace.completed = true;
    if (active === trace) active = null;
    const elapsedMs = Math.max(0, Math.round(performance.now() - trace.started));
    // Logging happens after the payment result has returned to the UI. Keep
    // only fixed labels and numbers; never retain the underlying SDK objects.
    const rows = trace.spans.map(span => ({
      run: trace.run, stage: span.stage,
      startMs: Math.round(span.startMs), endMs: Math.round(span.endMs),
      durationMs: Math.max(0, Math.round(span.endMs - span.startMs)),
    }));
    trace.spans.length = 0;
    setTimeout(() => {
      try {
        for (const row of rows) console.info('OPAGO_SEND_TIMING ' + JSON.stringify(row));
        console.info('OPAGO_SEND_TIMING ' + JSON.stringify({ run: trace.run, stage: 'total', durationMs: elapsedMs }));
      } catch { /* Diagnostics must not affect payments. */ }
    }, 250);
  };
}

/** Preserve the original result/promise/error and its exact invocation order. */
export function timeSendStep<T>(stage: SendTimingStage, operation: () => T): T {
  const trace = active;
  if (!trace || trace.completed || !allowedStages.has(stage)) return operation();
  const startMs = performance.now() - trace.started;
  const finish = () => {
    if (trace.completed || trace.spans.length >= 512) return;
    trace.spans.push({ stage, startMs, endMs: performance.now() - trace.started });
  };
  try {
    const result = operation();
    if (result instanceof Promise) {
      // Observer only: do not replace the promise or add an awaited step.
      void result.then(finish, finish);
    } else finish();
    return result;
  } catch (cause) {
    finish();
    throw cause;
  }
}
