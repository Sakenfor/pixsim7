/**
 * Providers API Domain Client
 *
 * Provides typed access to AI provider management endpoints including
 * provider specs and provider account management.
 */
import type { PixSimApiClient } from '../client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

type Schemas = ApiComponents['schemas'];

// ===== Provider Types =====

export type ProviderSpec = Schemas['ProviderInfo'];

// ===== Account Types =====

type ListAccountsQuery =
  ApiOperations['list_accounts_api_v1_accounts_get']['parameters']['query'];
type CreateAccountApiKeyQuery =
  ApiOperations['create_account_api_key_api_v1_accounts__account_id__create_api_key_post']['parameters']['query'];
type AccountStatsQuery =
  ApiOperations['get_account_stats_api_v1_accounts__account_id__stats_get']['parameters']['query'];
type PixverseStatusQuery =
  ApiOperations['get_pixverse_status_api_v1_accounts__account_id__pixverse_status_get']['parameters']['query'];

export type ProviderAccount = Schemas['AccountResponse'];
export type CreateAccountRequest = Schemas['AccountCreate'];
export type UpdateAccountRequest = Schemas['AccountUpdate'];
export type CreateApiKeyResponse = Schemas['CreateAccountApiKeyResponse'];
export type SetAccountCreditRequest = Schemas['SetCreditRequest'];
export type SetAccountCreditResponse = Schemas['AccountResponse'];
export type AccountStatsResponse = Schemas['AccountStatsResponse'];
export type PixverseStatusResponse = Schemas['PixverseStatusResponse'];

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
