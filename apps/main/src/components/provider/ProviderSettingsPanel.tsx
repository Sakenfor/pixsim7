import { useState, useMemo } from 'react';
import { Button, FormField, Input, useToast } from '@pixsim7/shared.ui';
import { useProviderCapacity } from '@/hooks/useProviderAccounts';
import { useProviders } from '@/hooks/useProviders';
import type { ProviderAccount } from '@/hooks/useProviderAccounts';
import { deleteAccount, toggleAccountStatus, updateAccount } from '@/lib/api/accounts';
import type { UpdateAccountRequest } from '@/lib/api/accounts';
import { apiClient } from '@/lib/api/client';
import { EditAccountModal } from './EditAccountModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface ProviderSettings {
  provider_id: string;
  global_password: string | null;
  auto_reauth_enabled: boolean;
  auto_reauth_max_retries: number;
}

export function ProviderSettingsPanel() {
  const { providers } = useProviders();
  const [refreshKey, setRefreshKey] = useState(0);
  const { capacity, loading, error, accounts } = useProviderCapacity(refreshKey);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingAccount, setEditingAccount] = useState<ProviderAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<ProviderAccount | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'credits' | 'lastUsed' | 'success'>('lastUsed');
  const [sortDesc, setSortDesc] = useState(true);

  // Provider-level settings
  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const toast = useToast();

  const handleSaveAccount = async (accountId: number, data: UpdateAccountRequest) => {
    try {
      await updateAccount(accountId, data);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Error in handleSaveAccount:', error);
      throw error; // Re-throw so modal can catch it
    }
  };

  const handleToggleStatus = async (account: ProviderAccount) => {
    try {
      await toggleAccountStatus(account.id, account.status);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to toggle status:', error);
      alert('Failed to update account status');
    }
  };

  const handleDeleteAccount = async (accountId: number) => {
    await deleteAccount(accountId);
    setRefreshKey(prev => prev + 1);
  };

  // Load provider settings when activeProvider changes
  const loadProviderSettings = async (providerId: string) => {
    try {
      const response = await apiClient.get<ProviderSettings>(`/providers/${providerId}/settings`);
      setProviderSettings(response.data);
    } catch (error) {
      console.error('Failed to load provider settings:', error);
    }
  };

  const saveProviderSettings = async () => {
    if (!activeProvider || !providerSettings) return;

      setSavingSettings(true);
      try {
        await apiClient.patch<ProviderSettings>(`/providers/${activeProvider}/settings`, {
          global_password: providerSettings.global_password || null,
          auto_reauth_enabled: providerSettings.auto_reauth_enabled,
          auto_reauth_max_retries: providerSettings.auto_reauth_max_retries,
        });

      // Show brief success message
      const tempSuccess = document.createElement('div');
      tempSuccess.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50';
      tempSuccess.textContent = 'Settings saved successfully';
      document.body.appendChild(tempSuccess);
      setTimeout(() => tempSuccess.remove(), 2000);
    } catch (error) {
      console.error('Failed to save provider settings:', error);
      alert(`Failed to save settings: ${error}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // Get provider names map
  const providerNames = providers.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.name;
    return acc;
  }, {});

  // Auto-select first provider if none selected
  const activeProvider = selectedProvider || (capacity.length > 0 ? capacity[0].provider_id : null);
  const providerData = capacity.find(c => c.provider_id === activeProvider);

  // Sorted accounts
  const sortedAccounts = useMemo(() => {
    if (!providerData) return [];
    const accounts = [...providerData.accounts];

    accounts.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = (a.nickname || a.email).localeCompare(b.nickname || b.email);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'credits': {
          // Use backend-provided total_credits instead of recalculating
          comparison = a.total_credits - b.total_credits;
          break;
        }
        case 'lastUsed': {
          const aTime = a.last_used ? new Date(a.last_used).getTime() : 0;
          const bTime = b.last_used ? new Date(b.last_used).getTime() : 0;
          comparison = aTime - bTime;
          break;
        }
        case 'success':
          comparison = a.success_rate - b.success_rate;
          break;
      }

      return sortDesc ? -comparison : comparison;
    });

    return accounts;
  }, [providerData, sortBy, sortDesc]);

  useEffect(() => {
    if (editingAccountId == null) {
      setEditingAccount(null);
      return;
    }

    const baseAccount = accounts.find(acc => acc.id === editingAccountId) ?? null;
    setEditingAccount(baseAccount);

    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get<ProviderAccount>(`/accounts/${editingAccountId}`);
        if (!cancelled) {
          setEditingAccount(res.data);
        }
      } catch (error) {
        console.error('Failed to load account details', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editingAccountId, accounts]);

  // Load provider settings when active provider changes
  useEffect(() => {
    if (activeProvider) {
      loadProviderSettings(activeProvider);
    }
  }, [activeProvider]);

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

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(field);
      setSortDesc(true);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Modals */}
      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onClose={() => setEditingAccountId(null)}
          onSave={handleSaveAccount}
        />
      )}
      {deletingAccount && (
        <DeleteConfirmModal
          account={deletingAccount}
          onClose={() => setDeletingAccount(null)}
          onConfirm={handleDeleteAccount}
        />
      )}

      {/* Header */}
      <div className="p-4 border-b dark:border-neutral-700">
        <div className="flex items-center justify-end mb-3">
          <button
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="px-3 py-1 text-xs bg-neutral-200 dark:bg-neutral-700 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Provider tabs */}
        {capacity.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {capacity.map((cap) => {
              const isActive = activeProvider === cap.provider_id;

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
      <div className="flex-1 overflow-auto" key={refreshKey}>
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
            {/* Provider Configuration Section */}
            {providerSettings && (
              <div className="mb-6 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setSettingsExpanded(!settingsExpanded)}
                  className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors"
                >
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    Provider Configuration
                  </span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {settingsExpanded ? '▼' : '▶'}
                  </span>
                </button>

                {settingsExpanded && (
                  <div className="p-4 space-y-4 bg-white dark:bg-neutral-900">
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      Configure automatic re-authentication and password management for this provider.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        label="Global Password"
                        helpText="Fallback password for accounts without stored passwords"
                        size="sm"
                      >
                        <Input
                          type="password"
                          size="sm"
                          value={providerSettings.global_password || ''}
                          onChange={(e) => setProviderSettings({...providerSettings, global_password: e.target.value})}
                          placeholder="Enter global password"
                          autoComplete="new-password"
                        />
                      </FormField>

                      <FormField
                        label="Max Retry Attempts"
                        helpText="Maximum auto re-auth attempts per session expiry"
                        size="sm"
                      >
                        <Input
                          type="number"
                          size="sm"
                          min={1}
                          max={10}
                          value={providerSettings.auto_reauth_max_retries}
                          onChange={(e) => setProviderSettings({...providerSettings, auto_reauth_max_retries: parseInt(e.target.value) || 3})}
                        />
                      </FormField>
                    </div>

                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="rounded border-neutral-300 dark:border-neutral-600"
                          checked={providerSettings.auto_reauth_enabled}
                          onChange={(e) => setProviderSettings({...providerSettings, auto_reauth_enabled: e.target.checked})}
                        />
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Enable automatic re-authentication
                        </span>
                      </label>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 ml-6 mt-1">
                        Automatically re-login using Playwright when session expires (error 10005)
                      </p>
                    </div>

                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                      <strong>Note:</strong> Auto re-auth requires Playwright. Sessions are refreshed automatically when logged out elsewhere using the account's password or global password.
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={saveProviderSettings}
                        disabled={savingSettings}
                      >
                        {savingSettings ? 'Saving...' : 'Save Configuration'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

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

            {/* Sort Controls */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Sort by:</span>
              {[
                { key: 'lastUsed', label: 'Last Used' },
                { key: 'name', label: 'Name' },
                { key: 'credits', label: 'Credits' },
                { key: 'status', label: 'Status' },
                { key: 'success', label: 'Success Rate' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => toggleSort(key as typeof sortBy)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                    sortBy === key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  {label} {sortBy === key && (sortDesc ? '↓' : '↑')}
                </button>
              ))}
              <div className="flex-1" />
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {sortedAccounts.length} account{sortedAccounts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Accounts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedAccounts.map((account) => (
                <CompactAccountCard
                  key={account.id}
                  account={account}
                  onEdit={() => setEditingAccountId(account.id)}
                  onToggle={() => handleToggleStatus(account)}
                  onDelete={() => setDeletingAccount(account)}
                />
              ))}
            </div>

            {sortedAccounts.length === 0 && (
              <div className="text-center py-12 text-sm text-neutral-500">
                No accounts found for this provider
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
