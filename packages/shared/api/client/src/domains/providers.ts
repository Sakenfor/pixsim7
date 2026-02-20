/**
 * Providers API Domain Client
 *
 * Provides typed access to AI provider management endpoints including
 * provider specs and provider account management.
 */
import type { PixSimApiClient } from '../client';
import type {
  AccountCreate,
  AccountResponse,
  AccountStatsResponse,
  AccountUpdate,
  CreateAccountApiKeyApiV1AccountsAccountIdCreateApiKeyPostParams,
  CreateAccountApiKeyResponse,
  GetAccountStatsApiV1AccountsAccountIdStatsGetParams,
  GetPixverseStatusApiV1AccountsAccountIdPixverseStatusGetParams,
  ListAccountsApiV1AccountsGetParams,
  PixverseStatusResponse,
  ProviderInfo,
  SetCreditRequest,
} from '@pixsim7/shared.api.model';
export type {
  AccountStatsResponse,
  PixverseStatusResponse,
};

// ===== Provider Types =====

export type ProviderSpec = ProviderInfo;

// ===== Account Types =====

type ListAccountsQuery = ListAccountsApiV1AccountsGetParams;
type CreateAccountApiKeyQuery = CreateAccountApiKeyApiV1AccountsAccountIdCreateApiKeyPostParams;
type AccountStatsQuery = GetAccountStatsApiV1AccountsAccountIdStatsGetParams;
type PixverseStatusQuery = GetPixverseStatusApiV1AccountsAccountIdPixverseStatusGetParams;

export type ProviderAccount = AccountResponse;
export type CreateAccountRequest = AccountCreate;
export type UpdateAccountRequest = AccountUpdate;
export type CreateApiKeyResponse = CreateAccountApiKeyResponse;
export type SetAccountCreditRequest = SetCreditRequest;
export type SetAccountCreditResponse = AccountResponse;

// ===== Providers API Factory =====

export function createProvidersApi(client: PixSimApiClient) {
  return {
    // ===== Provider Specs =====

    async listProviders(): Promise<ProviderSpec[]> {
      const response = await client.get<readonly ProviderSpec[]>('/providers');
      return [...response];
    },

    // ===== Accounts =====

    async listAccounts(options?: ListAccountsQuery): Promise<ProviderAccount[]> {
      const response = await client.get<readonly ProviderAccount[]>('/accounts', {
        params: options,
      });
      return [...response];
    },

    async getAccount(accountId: number): Promise<ProviderAccount> {
      return client.get<ProviderAccount>(`/accounts/${accountId}`);
    },

    async createAccount(data: CreateAccountRequest): Promise<ProviderAccount> {
      return client.post<ProviderAccount>('/accounts', data);
    },

    async updateAccount(accountId: number, data: UpdateAccountRequest): Promise<ProviderAccount> {
      return client.patch<ProviderAccount>(`/accounts/${accountId}`, data);
    },

    async deleteAccount(accountId: number): Promise<void> {
      await client.delete<void>(`/accounts/${accountId}`);
    },

    async createApiKey(
      accountId: number,
      options?: CreateAccountApiKeyQuery
    ): Promise<CreateApiKeyResponse> {
      return client.post<CreateApiKeyResponse>(
        `/accounts/${accountId}/create-api-key`,
        undefined,
        { params: options }
      );
    },

    async setAccountCredit(
      accountId: number,
      data: SetAccountCreditRequest
    ): Promise<SetAccountCreditResponse> {
      return client.post<SetAccountCreditResponse>(`/accounts/${accountId}/credits`, data);
    },

    async getAccountStats(
      accountId: number,
      options?: AccountStatsQuery
    ): Promise<AccountStatsResponse> {
      return client.get<AccountStatsResponse>(`/accounts/${accountId}/stats`, { params: options });
    },

    async getPixverseStatus(
      accountId: number,
      options?: PixverseStatusQuery
    ): Promise<PixverseStatusResponse> {
      return client.get<PixverseStatusResponse>(`/accounts/${accountId}/pixverse-status`, {
        params: options,
      });
    },
  };
}

