/** Stable API v1 errors; never display server-supplied text to the user. */
export const ACTIVATION_ERROR_TEXT: Record<string, string> = {
  DAILY_ACTIVATION_LIMIT: 'Today’s Hedera account activations are used up. Please try again tomorrow.',
  ACTIVATION_QUEUE_FULL: 'Hedera account setup is busy. Please try again shortly.',
  RATE_LIMITED: 'Too many activation requests. Please wait and try again.',
  NETWORK_DISABLED: 'Hedera activation is not available for this network. Please contact Opago support.',
  INVALID_SIGNATURE: 'This wallet could not be verified for Hedera activation. Please contact Opago support.',
  INVALID_REQUEST: 'Hedera activation could not be started. Please contact Opago support.',
  CHALLENGE_EXPIRED: 'The activation request expired. Please try again.',
  CHALLENGE_USED: 'The activation request expired. Please try again.',
  CHALLENGE_NOT_FOUND: 'The activation request expired. Please try again.',
  JOB_NOT_FOUND: 'No Hedera activation was found for this wallet. Start account activation to continue.',
  PAYER_UNAVAILABLE: 'Hedera account setup is temporarily unavailable. Please try again later.',
  PAYER_LOW_BALANCE: 'Hedera account setup is temporarily unavailable. Please try again later.',
  STORAGE_UNAVAILABLE: 'Hedera account setup is temporarily unavailable. Please try again later.',
  MIRROR_UNAVAILABLE: 'Hedera account setup is temporarily unavailable. Please try again later.',
  SERVICE_UNAVAILABLE: 'Hedera account setup is temporarily unavailable. Please try again later.',
  CONNECTION_UNAVAILABLE: 'Could not connect to Hedera account setup. Check your connection and try again.',
};
