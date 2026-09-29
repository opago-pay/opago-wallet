'use strict';

// Spark SDK 0.7.12 logs native method parameters, including the ECIES private
// identity key. Patch the installed iOS source on every clean dependency install.
// Fail closed when the pinned SDK changes so a release cannot silently regain
// the logging path.
const fs = require('node:fs');
const path = require('node:path');

const sdkRoot = path.join(__dirname, '..', 'node_modules', '@buildonspark', 'spark-sdk');
const version = JSON.parse(fs.readFileSync(path.join(sdkRoot, 'package.json'), 'utf8')).version;
if (version !== '0.7.12') throw new Error(`Review native Spark logging before using SDK ${version}.`);

const swiftPath = path.join(sdkRoot, 'ios', 'SparkFrostModule.swift');
const source = fs.readFileSync(swiftPath, 'utf8');
for (const method of ['rn_encryptEcies', 'rn_decryptEcies', 'rn_getPublicKey', 'rn_batchGetPublicKeys']) {
  if (!source.includes(`func ${method}(`)) throw new Error(`Spark iOS method ${method} changed; review its logging.`);
}

const sensitiveLog = /\bprint\s*\(/;
if (process.argv.includes('--check')) {
  if (sensitiveLog.test(source)) throw new Error('Spark iOS source still contains native print calls.');
  process.stdout.write('Spark iOS native logging check passed.\n');
  process.exit(0);
}

const patched = source.replace(/^[ \t]*print\([^\r\n]*\)[ \t]*\r?\n/gm, '');
if (sensitiveLog.test(patched)) throw new Error('Spark iOS source has an unreviewed print call.');
if (patched !== source) fs.writeFileSync(swiftPath, patched);
process.stdout.write('Spark iOS native logging disabled.\n');
