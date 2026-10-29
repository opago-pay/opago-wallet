'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withXcodeProject, IOSConfig } = require('expo/config-plugins');

// Xcode resources build-phase entries reference PBXBuildFile IDs, not file paths.
// Look up the actual PBXFileReference names/paths instead to survive repeated prebuilds.
function addPrivacyResourceIfMissing(project, relativePath) {
  const references = project.pbxFileReferenceSection();
  const found = Object.values(references).some(ref =>
    ref && typeof ref === 'object' && [ref.name, ref.path].some(value =>
      typeof value === 'string' &&
      path.posix.basename(value.replace(/^"|"$/g, '')) === 'PrivacyInfo.xcprivacy'));
  if (!found) project.addResourceFile(relativePath, { target: project.getFirstTarget().uuid });
}

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
    addPrivacyResourceIfMissing(project, relativePath);
    return mod;
  });
};

module.exports.addPrivacyResourceIfMissing = addPrivacyResourceIfMissing;
