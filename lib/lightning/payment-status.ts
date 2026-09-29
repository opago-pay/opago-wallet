// These statuses explicitly mean the Lightning payment did not settle.
// Transfer/preimage/refund failures alone do not prove that the recipient
// was unpaid. Keep those ambiguous outcomes pending until proof is available.
export const LIGHTNING_UNPAID_STATUSES = new Set([
  'USER_TRANSFER_VALIDATION_FAILED',
  'LIGHTNING_PAYMENT_FAILED',
  'USER_SWAP_RETURNED',
]);
