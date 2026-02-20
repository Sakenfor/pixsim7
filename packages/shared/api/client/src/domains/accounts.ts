import type { PixSimApiClient } from '../client';
import type {
  AccountResponse,
  AccountStatus,
  AccountUpdate,
  CreateAccountApiKeyResponse,
  DevPixverseDryRunResponse,
  PixverseSyncDryRunApiV1DevPixverseSyncDryRunGetParams,
  PixverseGoogleConnectRequest,
} from '@pixsim7/shared.api.model';
export type {
  AccountResponse,
  AccountStatus,
  AccountUpdate,
  DevPixverseDryRunResponse,
};
export type CreateApiKeyResponse = CreateAccountApiKeyResponse;

type DryRunPixverseSyncQuery =
  PixverseSyncDryRunApiV1DevPixverseSyncDryRunGetParams;
type ConnectPixverseWithGoogleResponse = { account: AccountResponse };

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
      return res.account as AccountResponse;
    },

    async createApiKey(accountId: number): Promise<CreateApiKeyResponse> {
      return client.post<CreateApiKeyResponse>(`/accounts/${accountId}/create-api-key`);
    },
  };
}

