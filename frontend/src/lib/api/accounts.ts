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
  api_key_paid?: string;
  cookies?: Record<string, any>;
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
