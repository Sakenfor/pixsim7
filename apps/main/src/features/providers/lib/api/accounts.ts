import { apiClient } from '@lib/api/client';
import type { ProviderAccount } from '../../hooks/useProviderAccounts';
import { logEvent } from '@lib/utils/logging';

export interface UpdateAccountRequest {
  email?: string;
  nickname?: string;
  status?: 'active' | 'disabled' | 'exhausted' | 'error' | 'rate_limited';
  is_private?: boolean;
  is_google_account?: boolean;
  jwt_token?: string;
  api_key?: string;
  // Generic API keys; for Pixverse, entries with kind === 'openapi'
  // represent OpenAPI keys.
  api_keys?: Array<{ id?: string; kind: string; value: string; priority?: number }>;
  cookies?: Record<string, any>;
}

export async function getAccounts(): Promise<ProviderAccount[]> {
  const response = await apiClient.get<ProviderAccount[]>('/accounts');
  return response.data;
}

export async function updateAccount(
  accountId: number,
  updates: UpdateAccountRequest
): Promise<ProviderAccount> {
  logEvent('DEBUG', 'account_update_requested', {
    accountId,
    fields: Object.keys(updates)
  });

  const response = await apiClient.patch<ProviderAccount>(
    `/accounts/${accountId}`,
    updates
  );

  logEvent('INFO', 'account_updated', {
    accountId,
    email: response.data.email,
    status: response.data.status
  });

  return response.data;
}

export async function deleteAccount(accountId: number): Promise<void> {
  await apiClient.delete(`/accounts/${accountId}`);
}

export async function toggleAccountStatus(
  accountId: number,
  currentStatus: string
): Promise<ProviderAccount> {
  const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
  return updateAccount(accountId, { status: newStatus });
}

export async function updateAccountNickname(
  accountId: number,
  nickname: string
): Promise<ProviderAccount> {
  return updateAccount(accountId, { nickname });
}

/**
 * Dev-only: dry-run Pixverse video sync for a provider account.
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
 * Connect an existing Pixverse account using a Google ID token.
 *
 * Currently used to flag an account as Google-authenticated so that
 * auto-reauth can avoid using the global password flow. The backend
 * ignores the id_token value for now.
 */
export async function connectPixverseWithGoogle(
  accountId: number
): Promise<ProviderAccount> {
  const response = await apiClient.post(`/accounts/${accountId}/connect-google`, {
    id_token: 'manual',
  });
  return response.data.account as ProviderAccount;
}

export interface CreateApiKeyResponse {
  success: boolean;
  api_key_id?: number;
  api_key_name?: string;
  api_key?: string;
  already_exists?: boolean;
  account: ProviderAccount;
}

/**
 * Create an OpenAPI key for a Pixverse account.
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
