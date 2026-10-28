/** Michael's product decisions, 27 October 2026. Server enforcement belongs to
 * the API/Compliance boundary; this copy never grants payment authority. */
export const payoutBindingPolicy = {
  title: 'Payout wallet linking',
  unlink: 'You may unlink a payout wallet without immediately replacing it. OPAGO incoming and outgoing payments are unavailable until another wallet is linked.',
  loss: 'If you lose your self-custodial wallet and recovery words, its funds cannot be recovered by OPAGO. You can link a new wallet, but this does not recover or transfer the old funds.',
  evidence: 'Binding evidence is retained in the Compliance backend for 5 years. Unlinking does not delete this evidence.',
} as const;
