/**
 * Provider Accounts API (Feature-level wrapper)
 *
 * Re-exports from @lib/api/accounts for convenience.
 */

// Re-export all account API functions and types
export {
  getAccounts,
  updateAccount,
  deleteAccount,
  toggleAccountStatus,
  updateAccountNickname,
  dryRunPixverseSync,
  connectPixverseWithGoogle,
  createApiKey,
  getAccountStats,
  getInvitedAccounts,
} from '@lib/api/accounts';

export type {
  AccountResponse,
  AccountUpdate,
  AccountStatus,
  CreateApiKeyResponse,
  AccountStatsResponse,
  InvitedAccountsResponse,
} from '@lib/api/accounts';
