'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('./register-typescript.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

// Runs the production hook with dependency-aware effects and focus changes.
function balanceFixture(options = {}) {
  let cursor = 0;
  let dirty = true;
  let result;
  let effects = [];
  const slots = [];
  const reads = [];
  const stages = [];
  const frames = [];
  const params = {
    walletReady: true, sparkWallet: {}, prioritizeSpark: true, enableHedera: false,
    refreshHederaAccount: async () => { reads.push('hedera'); return { balanceTinybars: 200000000n }; },
    ...options.params,
  };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(value) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: value };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, value: callback };
      return slots[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) effects.push({ index, callback, deps });
    },
  };
  const deps = {
    react: hooks,
    'expo-router': { useFocusEffect: callback => hooks.useEffect(() => params.focused === false ? undefined : callback(), [callback, params.focused]) },
    '@react-navigation/native': { useIsFocused: () => params.focused !== false },
    '@/lib/balance-state': require('../lib/balance-state.ts'),
    '@/lib/promise-timeout': require('../lib/promise-timeout.ts'),
    '@/lib/startup-timing': { recordWalletStartupStage: value => stages.push(value) },
    '@/lib/display-spark-balance': { loadDisplaySparkBalance: async () => { reads.push('spark'); return options.sparkRead ? options.sparkRead() : { balance: 120n }; } },
    '@/lib/ui-ready': { yieldToUi: () => options.holdFrames ? new Promise(resolve => frames.push(resolve)) : Promise.resolve() },
  };
  const source = fs.readFileSync(path.join(__dirname, '../hooks/useWalletBalances.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported = {};
  new Function('require', 'exports', code)(name => deps[name] || {}, exported);
  function render() {
    for (let pass = 0; pass < 30; pass++) {
      dirty = false; cursor = 0; effects = [];
      result = exported.useWalletBalances(params);
      const commits = effects;
      for (const effect of commits) slots[effect.index]?.cleanup?.();
      for (const effect of commits) slots[effect.index] = { deps: effect.deps, cleanup: effect.callback() };
      if (!dirty) return result;
    }
    throw new Error('Hook did not settle after 30 renders.');
  }
  const settle = async () => { for (let i = 0; i < 4; i++) { await flush(); render(); } return result; };
  const unmount = () => { for (const slot of slots) slot?.cleanup?.(); };
  return { params, reads, stages, render, settle, unmount, releaseFrames: () => { for (const resolve of frames.splice(0)) resolve(); } };
}
module.exports = { balanceFixture };
