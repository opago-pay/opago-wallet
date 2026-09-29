'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

// Recovery words and payment state must move through Opago's verified recovery
// flow, never through an OS copy that omits device-bound Keystore keys.
const BACKUP_XML = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <include domain="file" path="opago-never-backup-sentinel"/>
</full-backup-content>
`;
const EXTRACTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <include domain="file" path="opago-never-backup-sentinel"/>
  </cloud-backup>
  <device-transfer>
    <include domain="file" path="opago-never-backup-sentinel"/>
  </device-transfer>
</data-extraction-rules>
`;

function withWalletBackup(config) {
  config = withAndroidManifest(config, mod => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.$['android:allowBackup'] = 'false';
    app.$['android:fullBackupContent'] = '@xml/opago_no_backup';
    app.$['android:dataExtractionRules'] = '@xml/opago_no_data_transfer';
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    await fs.promises.mkdir(directory, { recursive: true });
    await Promise.all([
      fs.promises.writeFile(path.join(directory, 'opago_no_backup.xml'), BACKUP_XML),
      fs.promises.writeFile(path.join(directory, 'opago_no_data_transfer.xml'), EXTRACTION_XML),
    ]);
    return mod;
  }]);
}

module.exports = withWalletBackup;
module.exports.BACKUP_XML = BACKUP_XML;
module.exports.EXTRACTION_XML = EXTRACTION_XML;
