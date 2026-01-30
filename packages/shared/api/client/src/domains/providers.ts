/**
 * Providers API Domain Client
 *
 * Provides typed access to AI provider management endpoints including
 * provider specs, accounts, API keys, and capability registry.
 */
import type { PixSimApiClient } from '../client';

// ===== Provider Types =====

export interface ProviderSpec {
  id: string;
  name: string;
  description?: string;
  type: 'image' | 'video' | 'llm' | 'tts' | 'stt';
  capabilities: string[];
  config_schema?: Record<string, unknown>;
  is_enabled: boolean;
  priority: number;
}

export interface ProviderCapability {
  id: string;
  name: string;
  description?: string;
  provider_types: string[];
  required_features?: string[];
}

// ===== Account Types =====

export interface ProviderAccount {
  id: number;
  provider_id: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
  config: Record<string, unknown>;
  usage_stats?: AccountUsageStats;
  created_at: string;
  updated_at: string;
}

export interface AccountUsageStats {
  total_requests: number;
  total_tokens?: number;
  total_cost_usd?: number;
  last_used_at?: string;
}

export interface CreateAccountRequest {
  provider_id: string;
  name: string;
  config: Record<string, unknown>;
  is_default?: boolean;
}

export interface UpdateAccountRequest {
  name?: string;
  config?: Record<string, unknown>;
  is_active?: boolean;
  is_default?: boolean;
}

// ===== API Key Types =====

export interface ApiKeyInfo {
  id: number;
  account_id: number;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
}

export interface CreateApiKeyRequest {
  account_id: number;
  name: string;
  expires_in_days?: number;
}

export interface CreateApiKeyResponse {
  key_info: ApiKeyInfo;
  api_key: string; // Only returned on creation
}

// ===== Credits Types =====

export interface AccountCredits {
  account_id: number;
  balance: number;
  currency: string;
  last_updated: string;
}

export interface CreditTransaction {
  id: number;
  account_id: number;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  reference_id?: string;
  created_at: string;
}

// ===== Providers API Factory =====

export function createProvidersApi(client: PixSimApiClient) {
  return {
    // ===== Provider Specs =====

    async listProviders(options?: {
      type?: string;
      enabled_only?: boolean;
    }): Promise<ProviderSpec[]> {
      const response = await client.get<{ providers: ProviderSpec[] }>('/providers', {
        params: options,
      });
      return response.providers;
    },

    async getProvider(providerId: string): Promise<ProviderSpec> {
      return client.get<ProviderSpec>(`/providers/${encodeURIComponent(providerId)}`);
    },

    async listCapabilities(): Promise<ProviderCapability[]> {
      const response = await client.get<{ capabilities: ProviderCapability[] }>(
        '/providers/capabilities'
      );
      return response.capabilities;
    },

    // ===== Accounts =====

    async listAccounts(options?: {
      provider_id?: string;
      active_only?: boolean;
    }): Promise<ProviderAccount[]> {
      const response = await client.get<{ accounts: ProviderAccount[] }>('/accounts', {
        params: options,
      });
      return response.accounts;
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

    async deleteAccount(accountId: number): Promise<{ message: string }> {
      return client.delete<{ message: string }>(`/accounts/${accountId}`);
    },

    async setDefaultAccount(accountId: number): Promise<ProviderAccount> {
      return client.post<ProviderAccount>(`/accounts/${accountId}/set-default`);
    },

    async testAccountConnection(accountId: number): Promise<{
      success: boolean;
      latency_ms?: number;
      error?: string;
    }> {
      return client.post(`/accounts/${accountId}/test`);
    },

    // ===== API Keys =====

    async listApiKeys(accountId: number): Promise<ApiKeyInfo[]> {
      const response = await client.get<{ keys: ApiKeyInfo[] }>(
        `/accounts/${accountId}/api-keys`
      );
      return response.keys;
    },

    async createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
      return client.post<CreateApiKeyResponse>(
        `/accounts/${data.account_id}/api-keys`,
        data
      );
    },

    async revokeApiKey(accountId: number, keyId: number): Promise<{ message: string }> {
      return client.delete<{ message: string }>(`/accounts/${accountId}/api-keys/${keyId}`);
    },

    // ===== Credits =====

    async getAccountCredits(accountId: number): Promise<AccountCredits> {
      return client.get<AccountCredits>(`/accounts/${accountId}/credits`);
    },

    async listCreditTransactions(accountId: number, options?: {
      limit?: number;
      offset?: number;
      type?: 'credit' | 'debit';
    }): Promise<CreditTransaction[]> {
      const response = await client.get<{ transactions: CreditTransaction[] }>(
        `/accounts/${accountId}/credits/transactions`,
        { params: options }
      );
      return response.transactions;
    },

    async addCredits(accountId: number, data: {
      amount: number;
      description: string;
      reference_id?: string;
    }): Promise<AccountCredits> {
      return client.post<AccountCredits>(`/accounts/${accountId}/credits/add`, data);
    },
  };
}
