'use strict';

// xcodebuild -list -json -project ios/Pods/Pods.xcodeproj reports both the
// generated scheme and its target. Select the intersection, never a guessed
// spelling or the application scheme.
function selectSafeHttpTest(raw) {
  const project = raw?.project;
  if (!Array.isArray(project?.schemes) || !Array.isArray(project?.targets)) {
    throw new Error('xcodebuild project schemes/targets are missing');
  }
  const expected = /^OpagoSafeHttp-(?:Unit-)?Tests$/;
  const schemes = project.schemes.filter(name => typeof name === 'string' && expected.test(name));
  const targets = project.targets.filter(name => typeof name === 'string' && expected.test(name));
  if (schemes.length !== 1 || targets.length !== 1 || schemes[0] !== targets[0]) {
    throw new Error('OpagoSafeHttp XCTest scheme or target is missing or ambiguous');
  }
  return { scheme: schemes[0], target: targets[0] };
}

module.exports = { selectSafeHttpTest };

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const selected = selectSafeHttpTest(JSON.parse(input));
      process.stdout.write(`${selected.scheme}\t${selected.target}\n`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  });
}
