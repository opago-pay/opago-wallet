# Security status

Last reviewed: 2026-08-06

This repository is a proof of concept and has not received an independent security audit. Do not use it for production custody, identity processing, or mainnet payments without a dedicated review.

## Dependency audit

A non-breaking npm audit fix was applied to the lockfile. A targeted override updates brace-expansion under minimatch 3.1.5 to the patched 1.1.18 release.

The remaining production-tree report at review time is:

- 0 critical
- 6 high
- 27 moderate
- 33 total

The remaining high-severity findings cannot be resolved safely inside the current dependency constraints:

- bigint-buffer is pulled through Solana/Atomiq and has no upstream fix reported by npm.
- postcss is in the Expo toolchain; npm proposes Expo 57, a breaking framework upgrade from SDK 54.
- ws is in the Privy/viem tree; npm proposes a breaking Privy upgrade.

The package names @atomiqlabs/chain-solana, @solana/buffer-layout-utils, and @solana/spl-token are reported as affected through the same unfixed bigint-buffer path rather than as three independent vulnerable implementations.

Before release, perform and test the Expo and Privy major-version migrations, reassess the Solana/Atomiq dependency tree, run npm audit again, and document whether each remaining advisory is reachable in the shipped native bundle.

## Reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw transaction dumps. Share only redacted reproduction data through the project owner's private security channel.
