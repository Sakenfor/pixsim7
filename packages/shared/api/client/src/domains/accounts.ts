import type { PixSimApiClient } from '../client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

type Schemas = ApiComponents['schemas'];

export type AccountResponse = Schemas['AccountResponse'];
export type AccountUpdate = Schemas['AccountUpdate'];
export type AccountStatus = Schemas['AccountStatus'];
export type CreateApiKeyResponse = Schemas['CreateAccountApiKeyResponse'];
export type DevPixverseDryRunResponse = Schemas['DevPixverseDryRunResponse'];

type DryRunPixverseSyncQuery =
  ApiOperations['pixverse_sync_dry_run_api_v1_dev_pixverse_sync_dry_run_get']['parameters']['query'];
type ConnectPixverseWithGoogleResponse =
  ApiOperations['connect_pixverse_with_google_api_v1_accounts__account_id__connect_google_post']['responses'][200]['content']['application/json'];
type PixverseGoogleConnectRequest = Schemas['PixverseGoogleConnectRequest'];

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
      options?: Omit<DryRunPixverseSyncQuery, 'account_id'>
    ): Promise<DevPixverseDryRunResponse> {
      const params: DryRunPixverseSyncQuery = { account_id: accountId, ...(options || {}) };
      return client.get<DevPixverseDryRunResponse>('/dev/pixverse-sync/dry-run', { params });
    },

    async connectPixverseWithGoogle(accountId: number): Promise<AccountResponse> {
      const request: PixverseGoogleConnectRequest = { id_token: 'manual' };
      const res = await client.post<ConnectPixverseWithGoogleResponse>(
        `/accounts/${accountId}/connect-google`,
        request
      );
      return res.account;
    },

    async createApiKey(accountId: number): Promise<CreateApiKeyResponse> {
      return client.post<CreateApiKeyResponse>(`/accounts/${accountId}/create-api-key`);
    },
  };
}
