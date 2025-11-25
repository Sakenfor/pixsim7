import { apiClient } from './client';
import type { ProviderAccount } from '../../hooks/useProviderAccounts';
import { logEvent } from '../logging';

export interface UpdateAccountRequest {
  email?: string;
  nickname?: string;
  status?: 'ACTIVE' | 'DISABLED' | 'EXHAUSTED' | 'ERROR' | 'RATE_LIMITED';
  is_private?: boolean;
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
  const newStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
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
 * Assumes the caller has already obtained a Google `id_token` via
 * Google Identity Services or another OAuth flow.
 */
export async function connectPixverseWithGoogle(
  accountId: number,
  idToken: string
): Promise<ProviderAccount> {
  const response = await apiClient.post(`/accounts/${accountId}/connect-google`, {
    id_token: idToken,
  });
  return response.data.account as ProviderAccount;
}
