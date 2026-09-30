'use strict';
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { withAppDelegate, withInfoPlist, withXcodeProject, IOSConfig } = require('expo/config-plugins');

function patchAppDelegate(contents, language) {
  if (contents.includes('RNSentrySDK.start()') || contents.includes('[RNSentrySDK start]')) {
    throw new Error('Remove default Sentry native initialization; Opago must install its native privacy filter first.');
  }
  if (contents.includes('OpagoNativeCrashDiagnostics.start()')) return contents;
  if (language !== 'swift') throw new Error('Opago native diagnostics requires the Expo Swift AppDelegate template.');
  const signature = /(func application\([^)]*didFinishLaunchingWithOptions[^)]*\) -> Bool \{)/s;
  if (!signature.test(contents)) throw new Error('Cannot locate iOS startup hook for native crash privacy filtering.');
  return contents.replace(signature, '$1\n    OpagoNativeCrashDiagnostics.start()');
}

function withNativeCrashDiagnostics(config, { dsn }) {
  config = withInfoPlist(config, mod => {
    mod.modResults.OpagoCrashDiagnosticsEnabled = process.env.EXPO_PUBLIC_SENTRY_ENABLED !== 'false';
    mod.modResults.OpagoCrashDiagnosticsDSN = dsn; // Public ingestion address, never an auth token.
    return mod;
  });
  config = withAppDelegate(config, mod => {
    mod.modResults.contents = patchAppDelegate(mod.modResults.contents, mod.modResults.language);
    return mod;
  });
  return withXcodeProject(config, async mod => {
    const root = mod.modRequest.platformProjectRoot;
    const name = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const directory = path.join(root, name);
    for (const file of ['OpagoNativeCrashDiagnostics.h', 'OpagoNativeCrashDiagnostics.m']) {
      await fs.promises.copyFile(path.join(__dirname, 'native', file), path.join(directory, file));
    }
    const bridgingHeader = path.join(directory, `${name}-Bridging-Header.h`);
    const header = await fs.promises.readFile(bridgingHeader, 'utf8');
    if (!header.includes('#import "OpagoNativeCrashDiagnostics.h"')) {
      await fs.promises.writeFile(bridgingHeader, `${header}\n#import "OpagoNativeCrashDiagnostics.h"\n`);
    }
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${name}/OpagoNativeCrashDiagnostics.m`, groupName: name, project: mod.modResults,
    });
    // Explicitly generate dSYMs instead of relying on Xcode/template defaults.
    for (const entry of Object.values(mod.modResults.pbxXCBuildConfigurationSection())) {
      if (entry.buildSettings && entry.name.replaceAll('"', '') === 'Release') {
        entry.buildSettings.DEBUG_INFORMATION_FORMAT = '"dwarf-with-dsym"';
      }
    }
    return mod;
  });
}
module.exports = withNativeCrashDiagnostics;
module.exports.patchAppDelegate = patchAppDelegate;
