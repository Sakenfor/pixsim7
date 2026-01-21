/**
 * Accounts API Client
 *
 * Typed API client for /api/v1/accounts endpoint.
 * Uses OpenAPI-generated types for type safety and contract alignment.
 */
import { createAccountsApi } from '@pixsim7/shared.api.client/domains';
import type { AccountResponse, AccountStatus, AccountUpdate, CreateApiKeyResponse } from '@pixsim7/shared.api.client/domains';
import type { ApiComponents } from '@pixsim7/shared.types';

import { logEvent } from '@lib/utils/logging';

import { pixsimClient } from './client';

export type { AccountResponse, AccountUpdate, AccountStatus, CreateApiKeyResponse } from '@pixsim7/shared.api.client/domains';

// OpenAPI-generated types
export type AccountStatsResponse = ApiComponents['schemas']['AccountStatsResponse'];
export type InvitedAccountsResponse = ApiComponents['schemas']['InvitedAccountsResponse'];

const accountsApi = createAccountsApi(pixsimClient);

// ============================================================================
// API Functions
// ============================================================================

/**
 * List all provider accounts
 */
export async function getAccounts(): Promise<AccountResponse[]> {
  return accountsApi.getAccounts();
}

/**
 * Update a provider account
 */
export async function updateAccount(
  accountId: number,
  updates: AccountUpdate
): Promise<AccountResponse> {
  logEvent('DEBUG', 'account_update_requested', {
    accountId,
    fields: Object.keys(updates),
  });
  const account = await accountsApi.updateAccount(accountId, updates);

  logEvent('INFO', 'account_updated', {
    accountId,
    email: account.email,
    status: account.status,
  });

  return account;
}

/**
 * Delete a provider account
 */
export async function deleteAccount(accountId: number): Promise<void> {
  await accountsApi.deleteAccount(accountId);
}

/**
 * Toggle account status between active and disabled
 */
export async function toggleAccountStatus(
  accountId: number,
  currentStatus: string
): Promise<AccountResponse> {
  const newStatus: AccountStatus = currentStatus === 'active' ? 'disabled' : 'active';
  return updateAccount(accountId, { status: newStatus });
}

/**
 * Update account nickname
 */
export async function updateAccountNickname(
  accountId: number,
  nickname: string
): Promise<AccountResponse> {
  return updateAccount(accountId, { nickname });
}

/**
 * Dev-only: dry-run Pixverse video sync for a provider account
 */
export async function dryRunPixverseSync(
  accountId: number,
  options?: { limit?: number; offset?: number }
): Promise<any> {
  return accountsApi.dryRunPixverseSync(accountId, options);
}

/**
 * Connect an existing Pixverse account using a Google ID token
 *
 * Currently used to flag an account as Google-authenticated so that
 * auto-reauth can avoid using the global password flow. The backend
 * ignores the id_token value for now.
 */
export async function connectPixverseWithGoogle(
  accountId: number
): Promise<AccountResponse> {
  return accountsApi.connectPixverseWithGoogle(accountId);
}

/**
 * Create an OpenAPI key for a Pixverse account
 *
 * This enables efficient status polling via direct API calls instead of
 * listing all videos. Any JWT-authenticated Pixverse account can create
 * API keys.
 *
 * @param accountId - The account ID to create the key for
 * @returns The created API key info and updated account
 */
export async function createApiKey(
  accountId: number
): Promise<CreateApiKeyResponse> {
  return accountsApi.createApiKey(accountId);
}

/**
 * Get account statistics (invited count, user info)
 *
 * Returns cached stats if available (TTL: 1 hour), otherwise fetches fresh data.
 * Only available for Pixverse accounts.
 *
 * @param accountId - The account ID
 * @param force - Force refresh (bypass cache)
 * @returns Account stats including invited count and user info
 */
export async function getAccountStats(
  accountId: number,
  force = false
): Promise<AccountStatsResponse> {
  const params = force ? '?force=true' : '';
  return pixsimClient.get<AccountStatsResponse>(`/accounts/${accountId}/stats${params}`);
}

/**
 * Get full list of invited/referred accounts
 *
 * Returns detailed information about users who registered using this account's
 * referral code. Only available for Pixverse accounts.
 *
 * @param accountId - The account ID
 * @param pageSize - Number of results per page (default: 20)
 * @param offset - Pagination offset (default: 0)
 * @returns List of invited accounts with details
 */
export async function getInvitedAccounts(
  accountId: number,
  pageSize = 20,
  offset = 0
): Promise<InvitedAccountsResponse> {
  const params = new URLSearchParams({
    page_size: pageSize.toString(),
    offset: offset.toString(),
  });
  return pixsimClient.get<InvitedAccountsResponse>(`/accounts/${accountId}/invited-accounts?${params}`);
}
