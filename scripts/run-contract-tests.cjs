'use strict';
/* global __dirname */
const path = require('node:path');
const Mocha = require('mocha');
const runtime = require('./contract-test-runtime.cjs');
const { compileContracts } = require('./compile-contracts.cjs');

async function main() {
  compileContracts();
  await runtime.initialize();
  try {
    const mocha = new Mocha({ timeout: 20_000 });
    mocha.addFile(path.join(__dirname, '..', 'contract-tests', 'OpagoHbarCheckout.test.cjs'));
    const failures = await new Promise(resolve => mocha.run(resolve));
    if (failures) process.exitCode = 1;
  } finally {
    await runtime.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
