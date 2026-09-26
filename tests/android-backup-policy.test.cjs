'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../app.json').expo;
const { BACKUP_XML, EXTRACTION_XML } = require('../plugins/with-wallet-backup');

test('generated Android builds disable app backup and install explicit transfer restrictions', () => {
  assert.equal(config.android.allowBackup, false);
  assert.ok(config.plugins.includes('./plugins/with-wallet-backup'));
  const secureStore = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-secure-store');
  assert.equal(secureStore[1].configureAndroidBackup, false);
  assert.match(BACKUP_XML, /<include domain="file" path="opago-never-backup-sentinel"\/>/);
  assert.match(EXTRACTION_XML, /<cloud-backup>[\s\S]*?<include domain="file" path="opago-never-backup-sentinel"\/>/);
  assert.match(EXTRACTION_XML, /<device-transfer>[\s\S]*?<include domain="file" path="opago-never-backup-sentinel"\/>/);
  assert.doesNotMatch(BACKUP_XML + EXTRACTION_XML, /<include[^>]*path="\."/);
});
