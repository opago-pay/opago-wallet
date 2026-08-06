# Security status

Last reviewed: 2026-08-06

This repository is a proof of concept and has not received an independent security audit. Do not use it for production custody, identity processing, or mainnet payments without a dedicated review.

## Dependency audit

A non-breaking npm audit fix was applied to the lockfile. Targeted same-major overrides update brace-expansion, postcss, and both supported ws major lines to patched releases.

The remaining production-tree report at review time is:

- 0 critical
- 4 high
- 26 moderate
- 30 total

The remaining high-severity findings cannot be resolved safely inside the current dependency constraints:

- bigint-buffer is pulled through Solana/Atomiq and has no upstream fix reported by npm.

The package names @atomiqlabs/chain-solana, @solana/buffer-layout-utils, and @solana/spl-token are reported as affected through the same unfixed bigint-buffer path rather than as three independent vulnerable implementations.

Before release, reassess the Solana/Atomiq dependency tree, run npm audit again, and document whether the remaining bigint-buffer advisory is reachable in the shipped native bundle.

## Reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw transaction dumps. Share only redacted reproduction data through the project owner's private security channel.
