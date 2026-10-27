'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withXcodeProject, IOSConfig } = require('expo/config-plugins');

module.exports = function withPrivacyManifest(config) {
  return withXcodeProject(config, async mod => {
    const projectRoot = mod.modRequest.projectRoot;
    const platformRoot = mod.modRequest.platformProjectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const source = path.join(projectRoot, 'privacy', 'PrivacyInfo.xcprivacy');
    const destination = path.join(platformRoot, projectName, 'PrivacyInfo.xcprivacy');
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.copyFile(source, destination);
    const project = mod.modResults;
    const relativePath = `${projectName}/PrivacyInfo.xcprivacy`;
    const resources = project.pbxResourcesBuildPhase();
    const alreadyAdded = Object.values(resources.files || {}).some(file =>
      typeof file === 'object' && file.path === 'PrivacyInfo.xcprivacy');
    if (!alreadyAdded) {
      project.addResourceFile(relativePath, { target: project.getFirstTarget().uuid });
    }
    return mod;
  });
};
