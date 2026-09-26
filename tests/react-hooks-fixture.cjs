'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function hookFixture(file, makeDependencies, invoke) {
  const slots = []; let cursor = 0; let dirty = true; let effects = []; let result;
  const hooks = { ...React,
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn };
      return slots[i].value;
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) effects.push({ i, fn, deps });
    },
  };
  const dependencies = {
    react: hooks,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/hooks/useColorMode': { useColorMode: () => ({ mode: 'dark' }) },
    '@/lib/theme-styles': { adaptiveStyles: styles => styles, adaptColor: value => value, themeColor: role => role === 'accentText' ? '#ffb000' : '#fff' },
    '@/lib/performance-trace': require('./performance-trace-stub.cjs'),
    '../lib/performance-trace': require('./performance-trace-stub.cjs'),
    ...makeDependencies(hooks),
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => dependencies[name] || {}, exports);
  function render() {
    for (let n = 0; n < 30; n++) {
      cursor = 0; dirty = false; effects = []; result = invoke(exports);
      for (const effect of effects) slots[effect.i]?.cleanup?.();
      for (const effect of effects) slots[effect.i] = { deps: effect.deps, cleanup: effect.fn() };
      if (!dirty) return result;
    }
    throw new Error('Render did not settle');
  }
  return { render,
    settle: async () => { for (let n = 0; n < 5; n++) { await new Promise(resolve => setImmediate(resolve)); render(); } return result; },
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); },
  };
}
module.exports = { hookFixture };
