#!/usr/bin/env bash
set -euo pipefail

# Mac-only isolated native harness. Never run prebuild/pod install against the
# production checkout or an existing user-wallet container.
source_root="$(cd "$(dirname "$0")/.." && pwd -P)"
mode="${1:-}"

if [[ "$mode" == prepare ]]; then
  destination="${2:?Usage: prepare <empty-directory> <test.bundle.id> [Fixtures.json]}"
  bundle_id="${3:?Missing isolated bundle id}"
  fixture_file="${4:-}"
  [[ "$(uname -s)" == Darwin ]] || { echo 'Mac/Xcode required' >&2; exit 2; }
  [[ "$bundle_id" == *.safehttptest ]] || { echo 'Use a separate *.safehttptest bundle id' >&2; exit 2; }
  [[ ! -e "$destination" ]] || { echo 'Destination must be new and empty' >&2; exit 2; }
  if [[ -n "$fixture_file" ]]; then
    [[ -f "$fixture_file" ]] || { echo 'Fixture file missing' >&2; exit 2; }
    node "$source_root/scripts/validate-ios-safe-http-fixtures.cjs" "$fixture_file"
  fi
  mkdir -p "$destination"
  destination="$(cd "$destination" && pwd -P)"
  [[ "$destination" != "$source_root" && "$destination" != "$source_root"/* ]] || {
    echo 'Harness must be outside the source checkout' >&2; exit 2;
  }
  rsync -a --exclude='/.git/' --exclude='/node_modules/' --exclude='/output/' \
    --exclude='/ios/' --exclude='/android/' --exclude='/.expo/' \
    --exclude='.env*' --exclude='.codex-local-evidence/' \
    --exclude='*.sqlite' --exclude='*.db' --exclude='*.jks' \
    --exclude='*.key' --exclude='*.pem' --exclude='*.p12' \
    --exclude='*.p8' --exclude='*.mobileprovision' \
    "$source_root/" "$destination/"
  if [[ -n "$fixture_file" ]]; then
    cp "$fixture_file" "$destination/modules/opago-safe-http/ios/Tests/Fixtures.json"
  fi
  printf 'isolated native network test harness\n' > "$destination/.opago-safe-http-test-copy"
  cd "$destination"
  OPAGO_TEST_BUNDLE_ID="$bundle_id" node - <<'NODE'
const fs = require('node:fs');
const file = 'app.json';
const app = JSON.parse(fs.readFileSync(file, 'utf8'));
if (app.expo.ios.bundleIdentifier === process.env.OPAGO_TEST_BUNDLE_ID) throw Error('Production bundle id reused');
app.expo.ios.bundleIdentifier = process.env.OPAGO_TEST_BUNDLE_ID;
app.expo.name = 'Opago Safe HTTP Test';
fs.writeFileSync(file, `${JSON.stringify(app, null, 2)}\n`);
NODE
  [[ "$(node --version)" == v22.23.1 ]] || { echo 'Node 22.23.1 required' >&2; exit 2; }
  npm ci
  npx expo prebuild --platform ios --no-install
  python3 - <<'PY'
from pathlib import Path
podfile = Path('ios/Podfile')
source = podfile.read_text()
needle = '  use_expo_modules!\n'
assert source.count(needle) == 1, 'Unexpected Expo Podfile format'
source = source.replace(needle,
    "  pod 'OpagoSafeHttp', :path => '../modules/opago-safe-http/ios', :testspecs => ['Tests']\n" + needle)
podfile.write_text(source)
PY
  (cd ios && pod install)
  xcodebuild -version
  xcodebuild -list -project ios/Pods/Pods.xcodeproj
  echo "Harness ready at $destination. Production Podfile untouched."
  exit 0
fi

if [[ "$mode" == run || "$mode" == unit ]]; then
  harness="${2:?Usage: run|unit <prepared-harness> <xcode-destination> <result-directory>}"
  xcode_destination="${3:?Missing destination, e.g. platform=iOS,id=UDID}"
  result_directory="${4:?Missing result directory}"
  [[ "$(uname -s)" == Darwin ]] || { echo 'Mac/Xcode required' >&2; exit 2; }
  harness="$(cd "$harness" && pwd -P)"
  [[ -f "$harness/.opago-safe-http-test-copy" ]] || { echo 'Not an isolated harness' >&2; exit 2; }
  cd "$harness"
  if [[ "$mode" == run ]]; then
    node scripts/validate-ios-safe-http-fixtures.cjs modules/opago-safe-http/ios/Tests/Fixtures.json
  fi
  [[ "$(node --version)" == v22.23.1 ]] || { echo 'Node 22.23.1 required' >&2; exit 2; }
  scheme_json="$(xcodebuild -list -json -project ios/Pods/Pods.xcodeproj)"
  selection="$(printf '%s' "$scheme_json" | node scripts/select-ios-safe-http-test-scheme.cjs)" || {
    echo 'OpagoSafeHttp XCTest scheme/target missing or ambiguous' >&2; exit 1;
  }
  IFS=$'\t' read -r scheme test_target <<< "$selection"
  [[ -n "$scheme" && -n "$test_target" ]] || { echo 'Incomplete XCTest selection' >&2; exit 1; }
  mkdir -p "$result_directory"
  result_directory="$(cd "$result_directory" && pwd -P)"
  bundle="$result_directory/OpagoSafeHttp-$(date +%Y%m%d-%H%M%S).xcresult"
  filter=()
  check_mode=()
  if [[ "$mode" == unit ]]; then
    filter=("-only-testing:$test_target/OpagoSafeHttpTests")
    check_mode=(--unit)
  fi
  signing=()
  if [[ "$xcode_destination" == platform=iOS,id=* ]]; then
    [[ -n "${OPAGO_TEST_TEAM:-}" ]] || {
      echo 'Set OPAGO_TEST_TEAM for a separately signed physical-device test host' >&2; exit 2;
    }
    signing=("DEVELOPMENT_TEAM=$OPAGO_TEST_TEAM" 'CODE_SIGN_STYLE=Automatic')
  fi
  build_status=0
  xcodebuild -project ios/Pods/Pods.xcodeproj -scheme "$scheme" \
    -destination "$xcode_destination" -resultBundlePath "$bundle" \
    "${signing[@]}" "${filter[@]}" test || build_status=$?
  [[ -d "$bundle" ]] || { echo 'No .xcresult bundle; native gate incomplete' >&2; exit 1; }
  xcrun xcresulttool get test-results summary --path "$bundle" > "$result_directory/summary.json" || {
    echo 'No readable test summary; native gate incomplete' >&2; exit 1;
  }
  node scripts/check-ios-safe-http-xcresult.cjs "$result_directory/summary.json" "${check_mode[@]}" \
    | tee "$result_directory/counts.json"
  [[ "$build_status" -eq 0 ]] || { echo 'xcodebuild test failed' >&2; exit "$build_status"; }
  echo "Native test evidence: $bundle"
  exit 0
fi

echo 'Usage: prepare <empty-directory> <test.bundle.id> [Fixtures.json] | unit|run <prepared-harness> <xcode-destination> <result-directory>' >&2
exit 2
