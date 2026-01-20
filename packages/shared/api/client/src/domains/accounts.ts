import type { PixSimApiClient } from '../client';
import type { ApiComponents } from '@pixsim7/shared.types';

export type AccountResponse = ApiComponents['schemas']['AccountResponse'];
export type AccountUpdate = ApiComponents['schemas']['AccountUpdate'];
export type AccountStatus = ApiComponents['schemas']['AccountStatus'];

export interface CreateApiKeyResponse {
  success: boolean;
  api_key_id?: number;
  api_key_name?: string;
  api_key?: string;
  already_exists?: boolean;
  account: AccountResponse;
}

export function createAccountsApi(client: PixSimApiClient) {
  return {
    async getAccounts(): Promise<AccountResponse[]> {
      return client.get<AccountResponse[]>('/accounts');
    },

    async updateAccount(accountId: number, updates: AccountUpdate): Promise<AccountResponse> {
      return client.patch<AccountResponse>(`/accounts/${accountId}`, updates);
    },

    async deleteAccount(accountId: number): Promise<void> {
      await client.delete<void>(`/accounts/${accountId}`);
    },

    async toggleAccountStatus(accountId: number, currentStatus: string): Promise<AccountResponse> {
      const newStatus: AccountStatus = currentStatus === 'active' ? 'disabled' : 'active';
      return client.patch<AccountResponse>(`/accounts/${accountId}`, { status: newStatus });
    },

    async updateAccountNickname(accountId: number, nickname: string): Promise<AccountResponse> {
      return client.patch<AccountResponse>(`/accounts/${accountId}`, { nickname });
    },

    async dryRunPixverseSync(
      accountId: number,
      options?: { limit?: number; offset?: number }
    ): Promise<unknown> {
      const params: Record<string, string | number> = { account_id: accountId };
      if (options?.limit !== undefined) params.limit = options.limit;
      if (options?.offset !== undefined) params.offset = options.offset;
      return client.get<unknown>('/dev/pixverse-sync/dry-run', { params });
    },

    async connectPixverseWithGoogle(accountId: number): Promise<AccountResponse> {
      const res = await client.post<{ account: AccountResponse }>(
        `/accounts/${accountId}/connect-google`,
        { id_token: 'manual' }
      );
      return res.account;
    },

    async createApiKey(accountId: number): Promise<CreateApiKeyResponse> {
      return client.post<CreateApiKeyResponse>(`/accounts/${accountId}/create-api-key`);
    },
  };
}

