/**
 * Accounts API Client
 *
 * Typed API client for /api/v1/accounts endpoint.
 * Uses OpenAPI-generated types for type safety and contract alignment.
 */
import { apiClient } from './client';
import { logEvent } from '@lib/utils/logging';
import type { ApiComponents } from '@pixsim7/shared.types';

// ============================================================================
// OpenAPI-Derived Types (Generated from backend contract)
// ============================================================================

export type AccountResponse = ApiComponents['schemas']['AccountResponse'];
export type AccountUpdate = ApiComponents['schemas']['AccountUpdate'];
export type AccountStatus = ApiComponents['schemas']['AccountStatus'];

// ============================================================================
// Local Response Types (not yet in OpenAPI contract)
// ============================================================================

/**
 * Response from creating an API key.
 * Note: Backend returns `unknown` type; keeping local interface until schema is added.
 */
export interface CreateApiKeyResponse {
  success: boolean;
  api_key_id?: number;
  api_key_name?: string;
  api_key?: string;
  already_exists?: boolean;
  account: AccountResponse;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * List all provider accounts
 */
export async function getAccounts(): Promise<AccountResponse[]> {
  const response = await apiClient.get<AccountResponse[]>('/accounts');
  return response.data;
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

  const response = await apiClient.patch<AccountResponse>(
    `/accounts/${accountId}`,
    updates
  );

  logEvent('INFO', 'account_updated', {
    accountId,
    email: response.data.email,
    status: response.data.status,
  });

  return response.data;
}

/**
 * Delete a provider account
 */
export async function deleteAccount(accountId: number): Promise<void> {
  await apiClient.delete(`/accounts/${accountId}`);
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
  const params = new URLSearchParams();
  params.set('account_id', String(accountId));
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.offset !== undefined) params.set('offset', String(options.offset));

  const response = await apiClient.get(`/dev/pixverse-sync/dry-run?${params.toString()}`);
  return response.data;
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
  const response = await apiClient.post(`/accounts/${accountId}/connect-google`, {
    id_token: 'manual',
  });
  return response.data.account as AccountResponse;
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
  const response = await apiClient.post<CreateApiKeyResponse>(
    `/accounts/${accountId}/create-api-key`
  );
  return response.data;
}
