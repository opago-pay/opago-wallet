import type { PrivateStore } from './store';
/** Backward-compatible export of the single shared lifecycle preview flag. */
export { ACCOUNT_DELETION_PREVIEW_ENABLED } from './account-wallet-lifecycle-preview';
export type DeletionResult = { status: 'deleted' | 'pending'; receiptId: string };
export interface AccountDeletionAdapter {
  login(): Promise<{ accountId: string } | null>;
  deleteAccount(accountId: string): Promise<DeletionResult>;
}
export class MockAccountDeletionAdapter implements AccountDeletionAdapter {
  constructor(private readonly status: DeletionResult['status'] = 'deleted') {}
  async login() { return { accountId: 'mock-opago-account' }; }
  async deleteAccount(accountId: string) {
    if (!accountId) throw new Error('Authentication required');
    return { status: this.status, receiptId: 'mock-deletion-receipt' } as const;
  }
}
/** Only account-scoped app state may be purged. Wallet keys, mnemonic,
 * wallet preferences, wallet history and seed storage are never touched. */
export async function deletePreviewAccount(
  adapter: AccountDeletionAdapter,
  store: PrivateStore,
  accountId: string,
): Promise<DeletionResult> {
  if (!accountId.trim()) throw new Error('Authentication required');
  const result = await adapter.deleteAccount(accountId);
  if (result.status !== 'deleted' && result.status !== 'pending') throw new Error('Invalid deletion response');
  await store.remove('account-deletion-preview.session.' + accountId);
  await store.remove('account-deletion-preview.profile.' + accountId);
  return result;
}
