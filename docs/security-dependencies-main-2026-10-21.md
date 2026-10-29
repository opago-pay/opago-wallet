# Wallet dependency security update — 21 October 2026

Target: **main** (base 1aed902). This change is separate from Portal integration.
The Spark SDK version stays on the branch's existing version (main 0.7.12;
MVP 0.14.0). No native SDK migration or production activation is included.

## Updated resolution

| Package | Patched resolution |
| --- | --- |
| shell-quote | MVP 1.11.0; main already 1.12.0, retained |
| follow-redirects | 1.16.1 |
| undici | 6.28.1 |
| brace-expansion | 1.1.21 / 2.1.7 / 5.0.12, preserving each installed major line |
| @grpc/grpc-js | 1.13.6 for Hiero's previous 1.12.7; 1.14.5 for the 1.14 line |
| fast-copy | 3.1.0 |
| source-map-js | 1.2.2 |
| serialize-javascript | 7.1.2 |

The full lockfile audit found the same named dependency issues on both branches,
except shell-quote was already patched on main. The three additional patch updates
remove newly observed audit findings without migrating Expo or React Native.
Version-scoped overrides retain distinct brace-expansion and grpc API lines.
The Hiero gRPC dependency needs a minor update because the 1.12 line has no supplied
fix; the existing SDK and protobuf dependency versions are unchanged.

## Audit evidence and acceptance limit

`security-dependencies-2026-10-21.json` records the exact package resolutions,
before/after counts and remaining direct advisory URLs from `npm audit --json`.
The audit includes development and toolchain dependencies; it is not the external
App-Dependencies section of Michael's vulnerability report.

After these changes, npm reports **0 Critical, 23 High, 5 Moderate**. These 28
remaining package-level findings trace to three direct advisories:

- [braces: recursive-pattern stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), latest published version 3.0.3 still affected.
- [node-forge: RSA signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv), latest published version 1.4.0 still affected.
- [sprintf-js: unbounded precision](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), latest published version 1.1.3 still affected.

Registry versions were checked on 21 October. npm marks parent packages as fixable
by proposing Expo 44.0.6 or React Native 0.88.0; those are framework changes, not
patches for the named leaf packages, and are not applied as part of this fix.
No advisory is suppressed or severity threshold changed. Do not describe the
complete audit as clean or claim the external “0 Critical / 0 fixable” acceptance
until that report is rerun against the merged commits and its exact scope is checked.

Primary sources for the requested patches:
[shell-quote](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv),
[follow-redirects](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8),
[undici](https://github.com/nodejs/undici/security/advisories/GHSA-rfgv-xxqx-mfg5),
[gRPC](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j).

## Validation

Fresh `npm ci` and application checks use the declared Node 22.23.1 and npm 10.9.8.
Final test results are recorded in the PR. The existing Hiero protobuf peer warning
is retained, not hidden by `--force` or `--legacy-peer-deps`.
Device payment tests and a new vulnerability report remain separate acceptance steps.
