# UI production-readiness plan

This plan covers interface quality only. It does not change the wallet's testnet-only release status or claim that the product is ready for real funds.

## 1. Asset identity and consistency - complete

- Use one presentation model for Lightning, Solana, USDC, and Hedera.
- Show recognizable, scalable asset icons in Portfolio, Send, Receive, activity, and checkout selection.
- Show the active network next to every asset so a logo can never hide a testnet, devnet, or regtest context.
- Keep Hedera visibly restricted to `TESTNET` even if another network is enabled for mainnet.

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

## 5. Physical-device visual acceptance - pending

Run this after the UI commit is available in the clean acceptance checkout:

1. Build and install a fresh arm64 development-client APK.
2. Inspect Portfolio with long balances and a populated activity list.
3. Inspect Send with each asset selected, the keyboard open, and a scanned Hedera checkout request.
4. Inspect Receive for Lightning, Solana, and Hedera, including a generated QR and copy action.
5. Complete one Hedera testnet checkout and verify the review, success, and HashScan actions.
6. Check small-screen clipping, touch targets, contrast, dynamic text, and German/English string overflow before recording the milestone video.

## Deliberately deferred

- A full design-token/theme migration.
- Light mode, animation, and decorative illustration work.
- New onboarding or navigation architecture.
- Any mainnet enablement or real-fund production claim.

These are larger product decisions and are not required for the focused milestone polish pass.
