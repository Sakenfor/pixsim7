import { apiClient } from './client';
import type { ProviderAccount } from '../../hooks/useProviderAccounts';

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
  console.log(`Updating account ${accountId} with:`, updates);
  const response = await apiClient.patch<ProviderAccount>(
    `/accounts/${accountId}`,
    updates
  );
  console.log('Account updated:', response.data);
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
