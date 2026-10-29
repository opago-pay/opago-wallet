'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function source(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function jsxName(node) {
  return node.tagName?.getText() ?? node.openingElement?.tagName?.getText() ?? '';
}
function isTag(node, tag) {
  return (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && jsxName(node) === tag;
}
function allNodes(node, match, found = []) {
  if (match(node)) found.push(node);
  ts.forEachChild(node, child => { allNodes(child, match, found); });
  return found;
}

test('confetti overlays the root stack as a later sibling, not inside hidden tabs', () => {
  const root = source('app/_layout.tsx');
  const tabs = source('app/(tabs)/_layout.tsx');
  const ast = ts.createSourceFile('app/_layout.tsx', root, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const confetti = allNodes(ast, node => isTag(node, 'FirstPaymentConfetti'));
  assert.equal(confetti.length, 1, 'a single overlay is mounted at root');
  const host = allNodes(ast, node => isTag(node, 'View') &&
    node.children?.some(child => isTag(child, 'Stack')) &&
    node.children?.some(child => isTag(child, 'FirstPaymentConfetti')));
  assert.equal(host.length, 1, 'the root Stack and overlay share a positioned host');
  const children = host[0].children.filter(child => isTag(child, 'Stack') || isTag(child, 'FirstPaymentConfetti'));
  assert.deepEqual(children.map(jsxName), ['Stack', 'FirstPaymentConfetti'],
    'overlay is drawn after root stack screens');
  assert.match(root, /navigationHost: \{ flex: 1 \}/);
  assert.doesNotMatch(tabs, /FirstPaymentConfetti/,
    'tab-level overlay must not hide behind send-flow or onchain-send');
  for (const route of ['send-flow', 'onchain-send', 'uma-send']) {
    assert.match(root, new RegExp('<Stack\\.Screen name="' + route + '"'),
      route + ' is covered by the root overlay');
  }
});

test('onchain stack screen observes only confirmed BDK sends', () => {
  const flow = source('app/onchain-send.tsx');
  assert.match(flow, /operation\?\.kind !== 'send' \|\| operation\.state !== 'confirmed'/);
  assert.match(flow, /markFirstConfirmedPayment\(hederaPublicKey, 'sent'\)/);
});
