import { useEffect, useState } from 'react';
import { apiClient } from '@lib/api/client';

export interface ProviderAccount {
  id: number;
  user_id: number | null;
  email: string;
  provider_id: string;
  nickname: string | null;
  is_private: boolean;
  status: string;

  // Auth info
  has_jwt: boolean;
  jwt_expired: boolean;
  jwt_expires_at: string | null;
  has_api_key_paid: boolean;
  has_cookies: boolean;
  is_google_account: boolean;

  // Credits
  credits: Record<string, number>;
  total_credits: number;

  // Usage
  videos_today: number;
  total_videos_generated: number;
  total_videos_failed: number;
  success_rate: number;

  // Concurrency
  max_concurrent_jobs: number;
  current_processing_jobs: number;

  // Timing
  last_used: string | null;
  last_error: string | null;
  cooldown_until: string | null;
  created_at: string;
}

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
        const res = await apiClient.get<ProviderAccount[]>('/accounts');
        if (!cancelled) {
          let filtered = res.data;
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
      const activeAccounts = providerAccounts.filter(acc => acc.status === 'ACTIVE');
      const currentJobs = activeAccounts.reduce((sum, acc) => sum + acc.current_processing_jobs, 0);
      const maxJobs = activeAccounts.reduce((sum, acc) => sum + acc.max_concurrent_jobs, 0);
      const totalCredits = activeAccounts.reduce((sum, acc) => sum + acc.total_credits, 0);

      return {
        provider_id: providerId,
        total_accounts: providerAccounts.length,
        active_accounts: activeAccounts.length,
        current_jobs: currentJobs,
        max_jobs: maxJobs,
        total_credits: totalCredits,
        accounts: providerAccounts,
      };
    });

    setCapacity(capacityData);
  }, [accounts]);

  return { capacity, loading, error, accounts };
}
