export type AccountDeletionResult = { accepted: true };

// Deliberately disabled until API/Compliance confirms the endpoint, auth contract,
// deletion semantics, and legal-retention behavior. Public build flags default off.
export const accountDeletionEnabled = process.env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED === 'true';

export type AccountDeletionAdapterOptions = {
  endpoint?: string;
  authorizationHeader?: string;
  fetchImpl?: typeof fetch;
};

export async function requestAccountDeletion(options: AccountDeletionAdapterOptions = {}): Promise<AccountDeletionResult> {
  if (!accountDeletionEnabled) throw new Error('Account deletion requests are not enabled in this build.');
  const endpoint = options.endpoint || process.env.EXPO_PUBLIC_ACCOUNT_DELETION_API_URL || '';
  if (!endpoint) throw new Error('Account deletion endpoint is not configured.');
  if (!options.authorizationHeader) throw new Error('Fresh account authorization is required.');
  const response = await (options.fetchImpl || fetch)(endpoint, {
    method: 'POST',
    headers: { Authorization: options.authorizationHeader, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('The account deletion request could not be submitted.');
  return { accepted: true };
}
