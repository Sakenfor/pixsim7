import { useEffect, useState } from 'react';

import type { AccountResponse } from '@lib/api/accounts';
import { pixsimClient } from '@lib/api/client';

// ============================================================================
// OpenAPI-Derived Types
// ============================================================================

/**
 * ProviderAccount is an alias for the OpenAPI-derived AccountResponse.
 * Kept for backward compatibility with existing code.
 */
export type ProviderAccount = AccountResponse;

// ============================================================================
// UI/Feature-Specific Types
// ============================================================================

export interface ProviderAccountsGrouped {
  [providerId: string]: ProviderAccount[];
}

export interface ProviderCapacity {
  provider_id: string;
  total_accounts: number;
  active_accounts: number;
  current_jobs: number;
  max_jobs: number;
  total_credits: number;
  /** Aggregated credits by type across all accounts (e.g. {web: 500, openapi: 1000}) */
  credits_by_type: Record<string, number>;
  accounts: ProviderAccount[];
}

export function useProviderAccounts(providerId?: string, refreshKey?: number) {
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await pixsimClient.get<ProviderAccount[]>('/accounts');
        if (!cancelled) {
          let filtered = data;
          if (providerId) {
            filtered = filtered.filter(acc => acc.provider_id === providerId);
          }
          setAccounts(filtered);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load accounts');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [providerId, refreshKey]);

  return { accounts, loading, error };
}

export function useProviderCapacity(refreshKey?: number) {
  const { accounts, loading, error } = useProviderAccounts(undefined, refreshKey);
  const [capacity, setCapacity] = useState<ProviderCapacity[]>([]);

  useEffect(() => {
    // Group accounts by provider
    const grouped = accounts.reduce<ProviderAccountsGrouped>((acc, account) => {
      if (!acc[account.provider_id]) {
        acc[account.provider_id] = [];
      }
      acc[account.provider_id].push(account);
      return acc;
    }, {});

    // Calculate capacity per provider
    const capacityData: ProviderCapacity[] = Object.entries(grouped).map(([providerId, providerAccounts]) => {
      const activeAccounts = providerAccounts.filter(acc => acc.status === 'active');
      const currentJobs = providerAccounts.reduce((sum, acc) => sum + acc.current_processing_jobs, 0);
      const maxJobs = providerAccounts.reduce((sum, acc) => sum + acc.max_concurrent_jobs, 0);
      const totalCredits = providerAccounts.reduce((sum, acc) => sum + acc.total_credits, 0);

      // Aggregate credits by type (e.g. web, openapi) across all accounts
      const creditsByType: Record<string, number> = {};
      for (const acc of providerAccounts) {
        if (acc.credits) {
          for (const [type, amount] of Object.entries(acc.credits)) {
            creditsByType[type] = (creditsByType[type] || 0) + (amount as number);
          }
        }
      }

      return {
        provider_id: providerId,
        total_accounts: providerAccounts.length,
        active_accounts: activeAccounts.length,
        current_jobs: currentJobs,
        max_jobs: maxJobs,
        total_credits: totalCredits,
        credits_by_type: creditsByType,
        accounts: providerAccounts,
      };
    });

    setCapacity(capacityData);
  }, [accounts]);

  return { capacity, loading, error, accounts };
}
