import { OpagoError } from './api';
/** Never render an arbitrary transport, provider or identity-service exception. */
export function opagoUserError(cause: unknown): string {
  if (cause instanceof OpagoError) {
    const messages: Record<string, string> = {
      wallet_session_contract_pending: 'Wallet linking is not enabled yet. Backend acceptance is pending. Browser sign-in and your local wallet remain available.',
      account_logout_pending: 'Wallet sign-out could not be confirmed. Retry signing out. Portal and website sessions are not signed out by this action.',
      wallet_integration_disabled: 'OPAGO account services are not available in this build. Your local wallet remains available.',
      pos_integration_unavailable: 'POS linking awaits the agreed QR format and wallet-readable backend details and status. Your existing wallet remains available.',
      pos_qr_invalid: 'This is not a supported POS linking code. Ask the operator for a new QR code.',
      pos_wrong_wallet: 'This linking request targets another wallet. Open it with the intended wallet.',
      pos_details_invalid: 'The POS details could not be verified. No link is shown as complete.',
      pos_binding_changed: 'The POS recipient or binding version changed. Ask the operator for a new QR code.',
      pos_intent_used: 'This linking request was already used or expired. Ask the operator for a new QR code.',
      pos_review_required: 'Refresh and review the POS details before approving this request.',
      challenge_invalid: 'The approval challenge is invalid, used or expired. Refresh its status.',
      challenge_expired: 'The approval challenge expired. Refresh its status and ask for a new request.',
      action_mismatch: 'The proof does not match this wallet action. Refresh its status.',
      revision_conflict: 'The binding version changed in another request. Refresh its status.',
      app_update_required: 'Update your app to use OPAGO account services. Your local wallet remains available.',
      session_expired: 'Your OPAGO session expired. Sign in again.', refresh_invalid: 'Your OPAGO session expired. Sign in again.',
      reproof_required: 'Please sign in again and approve this wallet action.', account_mismatch: 'This wallet does not match the signed-in OPAGO account.',
      wallet_unavailable: 'Connect Lightning to prove or restore wallet ownership. Account sign-in and deletion remain available.',
      wallet_binding_required: 'Sign in and connect this Spark wallet to your OPAGO account before managing its address.',
      account_locked: 'Your OPAGO account is restricted. Contact support.',
      name_taken: 'This Lightning address name is already taken. Choose another name.',
      name_reserved: 'This Lightning address name is reserved. Choose another name.',
      name_invalid: 'Use a valid Lightning address name with letters, numbers, dots, hyphens or underscores.',
      rename_rate_limited: 'You cannot rename this address yet. Wait until the server allows another change.',
      rename_limit_reached: 'The allowed number of address changes has been reached.',
      address_changed: 'The server has not confirmed this address for the current wallet. Refresh its status or recover the unfinished operation.',
      kyc_required: 'This service is not enabled for your account. Contact support; no identity photos are required in MVP registration.',
      address_pending_kyc: 'The server has not activated this address. Contact support if it remains unavailable; no identity photo is required for the MVP address.',
      account_deleted: 'OPAGO account access has been revoked.', wallet_closed: 'Restore your OPAGO wallet link with the owning account.',
      operation_conflict: 'An earlier operation is unfinished or conflicts with this change. Recover it before starting another.',
      payment_already_open: 'Finish or cancel the current UMA payment before starting another.',
      uma_not_supported: 'The recipient does not support this UMA exchange. No payment was sent.',
      uma_verification_failed: 'The UMA response could not be verified. No payment was sent.',
      amount_out_of_range: 'The amount is outside the recipient’s supported range.', receipt_expired: 'The deletion receipt expired. Contact support.',
      tme_rejected: 'The backend declined this payment.',
    };
    return messages[cause.code] || (cause.retryable ? 'OPAGO is temporarily unavailable. Retry the same operation.' : 'OPAGO could not complete this operation. Refresh its status.');
  }
  const message = cause instanceof Error ? cause.message : '';
  if (/cancelled/i.test(message)) return 'Operation cancelled. No new payment was sent.';
  if (/invoice|target|recipient metadata|redirect/i.test(message)) return 'The payment details do not match the requested UMA payment. No payment was sent.';
  if (/fee/i.test(message)) return 'Payment fees changed. Review the payment again.';
  if (/data disclosure|consent|TRU contract/i.test(message)) return 'UMA sending is not available yet. Your local wallet remains available.';
  return 'OPAGO could not complete this operation. Retry the same operation or check its status.';
}
