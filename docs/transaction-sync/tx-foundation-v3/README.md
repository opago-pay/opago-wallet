# Authoritative upstream snapshot for F5

Version: **3.0.0-draft.1**, merged specification only. Retrieved 2026-10-06 from
`opago-pay/opago-compliance`, commit `25de377fcf73d653315fa3595f83d38e7b938137`.

- [Merged contract PR 573](https://github.com/opago-pay/opago-compliance/pull/573)
- [Original contract directory at the inspected revision](https://github.com/opago-pay/opago-compliance/tree/25de377fcf73d653315fa3595f83d38e7b938137/docs/contracts/tx-foundation-v3)
- [Governing data model](https://github.com/opago-pay/opago-compliance/blob/25de377fcf73d653315fa3595f83d38e7b938137/docs/payment-registration-data-model.md)
- [Governing shadow-mode rules](https://github.com/opago-pay/opago-compliance/blob/25de377fcf73d653315fa3595f83d38e7b938137/docs/wallet-tme-shadow-mode.md)
- [Governing customer relationships](https://github.com/opago-pay/opago-compliance/blob/25de377fcf73d653315fa3595f83d38e7b938137/docs/wallet-customer-relationships.md)

The eight upstream files are preserved verbatim. Their relative links describe the
upstream tree; use the pinned links above for the governing documents. This README
is wallet-side provenance, not an amendment to the contract. The older neighboring
`v3-draft/` proposal (0.3.0) is retained for history and does not govern F5 wire messages.

HBAR report preparation also reads the **unmerged**
[PR 593](https://github.com/opago-pay/opago-compliance/pull/593), head
`78d9bbc8935be3a67be8718be0b1355d5ee3184c`,
[HBAR evidence proposal](https://github.com/opago-pay/opago-compliance/blob/78d9bbc8935be3a67be8718be0b1355d5ee3184c/docs/hbar-binding-and-evidence.md).
Its fee, staking-reward, base-record and reference rules can be exercised locally;
they do not enable HBAR writes or resolve the still-open key-proof policy.

See [F5 handoff](../../f5-wallet-transaction-sync-handoff.md) for enablement gates,
test evidence, migration limits and required backend/device acceptance.
