const stages = [
  'direct_confirmed', 'direct_failed', 'direct_pending', 'direct_unavailable',
  'request_confirmed', 'request_failed', 'request_pending', 'request_missing', 'requests_unavailable',
  'history_confirmed', 'history_failed', 'history_pending', 'history_missing', 'history_unavailable',
  'operator_confirmed', 'operator_unresolved', 'operator_missing', 'operator_unavailable',
  'send_preflight_started', 'send_preflight_aborted', 'send_sdk_started', 'send_sdk_unresolved', 'send_sdk_returned',
] as const;
type RecoveryStage = typeof stages[number];

/** Internal opt-in: fixed outcomes only; never identifiers, amounts or SDK errors. */
export function recordLightningRecoveryStage(stage: RecoveryStage): void {
  if (process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS !== 'true' || !stages.includes(stage)) return;
  try { console.info('OPAGO_RECOVERY ' + stage); } catch { /* Diagnostics must not affect payment recovery. */ }
}
