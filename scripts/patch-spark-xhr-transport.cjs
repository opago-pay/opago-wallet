'use strict';
// SDK 0.14.0 supplies cancellation and deadline handling upstream. No rewrite:
// the published implementation is exercised by spark-xhr-patch.test.cjs.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'node_modules', '@buildonspark', 'spark-sdk');
if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version !== '0.14.0') {
  throw new Error('Review Spark native transport for the new SDK version.');
}
for (const file of ['src/services/xhr-transport.ts', 'dist/native/index.react-native.cjs', 'dist/native/index.react-native.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const marker of ['xhr.ontimeout', 'xhr.onabort', 'signal?.removeEventListener', 'UNARY_REQUEST_TIMEOUT_MS']) {
    if (!source.includes(marker)) throw new Error(`Spark upstream timeout/abort contract changed: ${file} (${marker}).`);
  }
  if (source.includes('OPAGO_XHR_ABORT_TIMEOUT')) throw new Error('Obsolete Spark XHR patch detected. Reinstall dependencies.');
}
process.stdout.write('Spark upstream XHR timeout and abort implementation verified.\n');
