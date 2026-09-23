type Stage = 'unlock_started' | 'home_mounted' | 'keys_ready' | 'lightning_ready' | 'hbar_balance' | 'lightning_balance' | 'saved_balance_available' | 'home_value_rendered' | 'home_live_balance_rendered' | 'lightning_balance_started' | 'hbar_refresh_started' | 'history_refresh_started' | 'spark_priority_timeout' | 'mnemonic_read_started' | 'mnemonic_read_complete' | 'seed_derivation_started' | 'seed_derivation_complete' | 'key_derivation_started' | 'key_derivation_complete' | 'backup_status_loaded' | 'spark_init_started';
let started = 0;
const recorded = new Set<Stage>();

export function beginWalletStartupTiming() {
  started = performance.now();
  recorded.clear();
  recordWalletStartupStage('unlock_started');
}

/** Opt-in local diagnostic: fixed stage names and durations, no wallet data. */
export function recordWalletStartupStage(stage: Stage) {
  if ((process.env.EXPO_PUBLIC_STARTUP_TIMING !== 'true' && process.env.EXPO_PUBLIC_PERF_TRACE !== 'true') || !started || recorded.has(stage)) return;
  recorded.add(stage);
  console.info('OPAGO_STARTUP ' + JSON.stringify({ stage, elapsedMs: Math.round(performance.now() - started) }));
}
