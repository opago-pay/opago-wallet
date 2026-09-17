# UI production-readiness plan

This plan covers interface quality only. It does not claim that the complete multi-chain application is audited or ready for unrestricted production use. The guarded Hedera Mainnet candidate is documented separately.

## 1. Asset identity and consistency - complete

- Use one presentation model for Lightning and Hedera.
- Show recognizable, scalable asset icons in Portfolio, Send, Receive, activity, and checkout selection.
- Show the active network next to every asset so a logo can never hide a testnet, devnet, or regtest context.
- Keep every asset's actual build-time network visible; the guarded Hedera candidate shows `MAINNET`, while Lightning remains visibly restricted to its development network.

## 2. Information hierarchy - complete

- Separate the portfolio heading, total value, safety state, asset list, and recent activity.
- Use consistent surface, border, radius, spacing, and muted-text treatments.
- Keep balances visually dominant while account IDs and network details remain readable but secondary.
- Replace prototype success text with graphical confirmation states and identify external explorer actions.

## 3. Interaction and accessibility - complete

- Make long Send and Receive forms scrollable on smaller Android screens and while the keyboard is open.
- Give selectable networks and assets radio semantics with their selected state.
- Give asset marks, copy controls, QR scanning, and explorer actions explicit accessibility labels or roles.
- Keep all payment review, signing, amount validation, and network-safety behavior unchanged.

## 4. Regression gates - complete

- TypeScript and ESLint must pass.
- UI tests lock the four asset identities, ticker-to-icon mapping, graphical success states, and removal of anonymous portfolio dots.
- The complete application and contract suites remain mandatory through `npm run phase5:verify`.

## 5. Consumer simplicity - implemented

- Replace duplicate portfolio and asset headings with a single wallet hierarchy, clear estimated balance, and two primary actions.
- Present Lightning as Bitcoin and Hedera as HBAR while retaining the exact network badge next to each asset.
- Shorten wallet identifiers in everyday views and expose copying as an explicit action.
- Translate raw transaction states into `Completed`, `Processing`, or `Needs attention` without changing the stored network result.
- Lead Send and Request with plain questions such as payment method, recipient, and amount.
- Keep full account IDs, transaction signatures, payment IDs, contract IDs, and explorer evidence behind voluntary payment-details and receipt controls.
- Use consumer-safe error copy for insufficient funds, expired requests, mismatched amounts, unavailable networks, and unresolved submissions while preserving the no-retry safety rule.
- Keep Mainnet and development modes visible through compact status rows instead of dominant technical warning cards.

## 6. Physical-device visual acceptance - grant flow complete

The English Hedera Mainnet happy path was inspected on the physical UMIDIGI Android device and recorded for the Thrive submission on 16 September 2026. The accepted path covered Home, Hedera selection, QR scan, payment review, confirmation, graphical success, HashScan, and refreshed activity.

The following broader app-store checks remain deliberately open:

1. dynamic text and screen-reader coverage beyond the recorded path;
2. German and other localized string overflow;
3. the complete Lightning and Hedera visual matrix on multiple screen sizes;
4. iOS layout and app-store screenshot acceptance.

## Deliberately deferred

- A full design-token/theme migration.
- Light mode, animation, and decorative illustration work.
- New onboarding or navigation architecture.
- Any mainnet enablement or real-fund production claim.

These are larger product decisions and are not required for the focused milestone polish pass.
