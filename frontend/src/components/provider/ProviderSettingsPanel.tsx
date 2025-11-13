import { useState } from 'react';
import { useProviderCapacity } from '../../hooks/useProviderAccounts';
import { useProviders } from '../../hooks/useProviders';
import type { ProviderAccount } from '../../hooks/useProviderAccounts';

function AccountRow({ account }: { account: ProviderAccount }) {
  const isActive = account.status === 'ACTIVE';
  const isAtCapacity = account.current_processing_jobs >= account.max_concurrent_jobs;
  const hasCredits = account.total_credits > 0;

  const statusColor = {
    ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
    EXHAUSTED: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
    ERROR: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400',
    DISABLED: 'bg-neutral-100 dark:bg-neutral-800/30 text-neutral-600 dark:text-neutral-500',
    RATE_LIMITED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400',
  }[account.status] || 'bg-neutral-100 dark:bg-neutral-800/30 text-neutral-600';

  return (
    <tr className="border-b dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
      <td className="px-3 py-2 text-sm">
        <div className="font-medium text-neutral-800 dark:text-neutral-200">
          {account.nickname || account.email}
        </div>
        {account.nickname && (
          <div className="text-xs text-neutral-500">{account.email}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor}`}>
          {account.status}
        </span>
      </td>
      <td className="px-3 py-2 text-sm font-mono text-neutral-700 dark:text-neutral-300">
        <div className="flex flex-col gap-0.5">
          {Object.entries(account.credits).map(([type, amount]) => (
            <div key={type} className="flex justify-between gap-2">
              <span className="text-xs text-neutral-500">{type}:</span>
              <span className={amount === 0 ? 'text-red-500' : ''}>{amount}</span>
            </div>
          ))}
          {Object.keys(account.credits).length === 0 && (
            <span className="text-neutral-500">0</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-sm font-mono">
        <div className="flex items-center gap-2">
          <span className="text-neutral-700 dark:text-neutral-300">
            {account.current_processing_jobs}/{account.max_concurrent_jobs}
          </span>
          {isAtCapacity && (
            <span className="text-xs text-amber-600 dark:text-amber-400">FULL</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-sm">
        <div className="flex flex-col gap-0.5 text-xs">
          {account.has_api_key_paid && (
            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400 rounded w-fit">
              PRO
            </span>
          )}
          {account.jwt_expired && (
            <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded w-fit">
              JWT EXPIRED
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400">
        <div className="text-xs">
          Success: {(account.success_rate * 100).toFixed(0)}%
        </div>
        <div className="text-xs">
          Generated: {account.total_videos_generated}
        </div>
      </td>
    </tr>
  );
}

export function ProviderSettingsPanel() {
  const { providers } = useProviders();
  const { capacity, loading, error } = useProviderCapacity();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-neutral-500">Loading provider accounts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-600 dark:text-red-400">
          Error loading accounts: {error}
        </div>
      </div>
    );
  }

  // Get provider names map
  const providerNames = providers.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.name;
    return acc;
  }, {});

  // Auto-select first provider if none selected
  const activeProvider = selectedProvider || (capacity.length > 0 ? capacity[0].provider_id : null);
  const providerData = capacity.find(c => c.provider_id === activeProvider);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="p-4 border-b dark:border-neutral-700">
        <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-3">
          Provider Settings
        </h2>

        {/* Provider tabs */}
        {capacity.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {capacity.map((cap) => {
              const isActive = activeProvider === cap.provider_id;
              const utilizationPercent = cap.max_jobs > 0
                ? Math.round((cap.current_jobs / cap.max_jobs) * 100)
                : 0;

              return (
                <button
                  key={cap.provider_id}
                  onClick={() => setSelectedProvider(cap.provider_id)}
                  className={`px-4 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  <div className="text-sm font-medium">
                    {providerNames[cap.provider_id] || cap.provider_id}
                  </div>
                  <div className="text-xs opacity-80">
                    {cap.current_jobs}/{cap.max_jobs} jobs • {cap.total_credits} credits
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {capacity.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="text-sm text-neutral-500 mb-4">
              No provider accounts configured yet.
            </div>
            <div className="text-xs text-neutral-400 max-w-md">
              Install the browser extension and add accounts for Pixverse, Sora, or other providers to get started.
            </div>
          </div>
        ) : providerData ? (
          <div className="p-4">
            {/* Provider summary */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-3 border rounded-lg dark:border-neutral-700">
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                  Total Accounts
                </div>
                <div className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">
                  {providerData.total_accounts}
                </div>
                <div className="text-xs text-neutral-500">
                  {providerData.active_accounts} active
                </div>
              </div>
              <div className="p-3 border rounded-lg dark:border-neutral-700">
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                  Jobs Running
                </div>
                <div className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">
                  {providerData.current_jobs}/{providerData.max_jobs}
                </div>
                <div className="text-xs text-neutral-500">
                  {providerData.max_jobs > 0
                    ? Math.round((providerData.current_jobs / providerData.max_jobs) * 100)
                    : 0}% utilized
                </div>
              </div>
              <div className="p-3 border rounded-lg dark:border-neutral-700">
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                  Total Credits
                </div>
                <div className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">
                  {providerData.total_credits.toLocaleString()}
                </div>
              </div>
              <div className="p-3 border rounded-lg dark:border-neutral-700">
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                  Avg Success Rate
                </div>
                <div className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">
                  {providerData.accounts.length > 0
                    ? Math.round(
                        (providerData.accounts.reduce((sum, acc) => sum + acc.success_rate, 0) /
                          providerData.accounts.length) *
                          100
                      )
                    : 0}%
                </div>
              </div>
            </div>

            {/* Accounts table */}
            <div className="border rounded-lg dark:border-neutral-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-100 dark:bg-neutral-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      Account
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      Credits
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      Jobs
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      Info
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      Stats
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {providerData.accounts.map((account) => (
                    <AccountRow key={account.id} account={account} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
