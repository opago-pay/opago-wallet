import { OpagoError } from './api';
/** Never render an arbitrary transport, provider or identity-service exception. */
export function opagoUserError(cause: unknown): string {
  if (cause instanceof OpagoError) {
    const messages: Record<string, string> = {
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
      kyc_required: 'Complete identity onboarding and wait for the backend comparison result.',
      address_pending_kyc: 'Your Lightning address is not active yet. Refresh its status before sending with UMA.',
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
