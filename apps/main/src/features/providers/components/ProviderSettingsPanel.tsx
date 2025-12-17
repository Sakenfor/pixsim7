import { useState, useMemo, useEffect } from 'react';
import { Button, FormField, Input, useToast } from '@pixsim7/shared.ui';
import { useProviderCapacity } from '../hooks/useProviderAccounts';
import { useProviders } from '../hooks/useProviders';
import type { ProviderAccount } from '../hooks/useProviderAccounts';
import { deleteAccount, toggleAccountStatus, updateAccount } from '../lib/api/accounts';
import type { UpdateAccountRequest } from '../lib/api/accounts';
import { apiClient } from '@lib/api/client';
import { EditAccountModal } from './EditAccountModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { CompactAccountCard } from './CompactAccountCard';
import { AIProviderSettings } from './AIProviderSettings';
import {
  getPixverseSyncDryRun,
  syncPixverseAssets,
  refreshAssetLineage,
  type SyncDryRunResponse,
} from '../lib/api/pixverseSync';

interface ProviderSettings {
  provider_id: string;
  global_password: string | null;
  auto_reauth_enabled: boolean;
  auto_reauth_max_retries: number;
}

type ProviderTab = 'accounts' | 'config' | 'lineage';

export function ProviderSettingsPanel() {
  const { providers } = useProviders();
  const [refreshKey, setRefreshKey] = useState(0);
  const { capacity, loading, error, accounts } = useProviderCapacity(refreshKey);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingAccount, setEditingAccount] = useState<ProviderAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<ProviderAccount | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'credits' | 'lastUsed' | 'success'>('lastUsed');
  const [sortDesc, setSortDesc] = useState(true);

  // Provider-level settings
  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Active provider tab (for provider-specific content)
  const [activeTab, setActiveTab] = useState<ProviderTab>('accounts');
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

  const providerTabList = providers.length
    ? providers.map((p) => ({ id: p.id, name: p.name }))
    : capacity.map((c) => ({ id: c.provider_id, name: providerNames[c.provider_id] || c.provider_id }));

  // Auto-select first provider if none selected (even if it has 0 accounts)
  const activeProvider = selectedProvider || (providerTabList.length > 0 ? providerTabList[0].id : null);
  const providerData =
    capacity.find((c) => c.provider_id === activeProvider) ||
    (activeProvider
      ? {
          provider_id: activeProvider,
          total_accounts: 0,
          active_accounts: 0,
          current_jobs: 0,
          max_jobs: 0,
          total_credits: 0,
          accounts: [] as ProviderAccount[],
        }
      : null);

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
          onRefresh={() => setRefreshKey(prev => prev + 1)}
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
        {providerTabList.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {providerTabList.map((tab) => {
              const cap = capacity.find((c) => c.provider_id === tab.id) || null;
              const isActive = !showGlobalSettings && activeProvider === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setSelectedProvider(tab.id);
                    setShowGlobalSettings(false);
                  }}
                  className={`px-4 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  <div className="text-sm font-medium">
                    {providerNames[tab.id] || tab.name || tab.id}
                  </div>
                  <div className="text-xs opacity-80">
                    {cap ? `${cap.current_jobs}/${cap.max_jobs} jobs • ${cap.total_credits} credits` : '0/0 jobs • 0 credits'}
                  </div>
                </button>
              );
            })}

            {/* Global Settings tab */}
            <button
              onClick={() => setShowGlobalSettings(true)}
              className={`px-4 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                showGlobalSettings
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              <div className="text-sm font-medium">Settings</div>
              <div className="text-xs opacity-80">AI Providers & Global</div>
            </button>
          </div>
        )}
      </div>

      {/* Provider-specific Tabs (only show when a provider is selected, not global settings) */}
      {providerData && !showGlobalSettings && (
        <div className="border-b dark:border-neutral-700">
          <div className="flex gap-1 px-4">
            {[
              { id: 'accounts' as const, label: 'Accounts' },
              { id: 'config' as const, label: 'Configuration' },
              ...(activeProvider === 'pixverse' ? [{ id: 'lineage' as const, label: 'Library & Lineage' }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto" key={refreshKey}>
        {/* Global Settings Content */}
        {showGlobalSettings ? (
          <div className="p-4">
            <div className="max-w-2xl">
              <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
                AI Providers
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
                Configure AI providers for prompt editing and other AI-powered features.
                These settings apply globally across all video providers.
              </p>
              <AIProviderSettings
                onSaveSuccess={() => {
                  toast?.({
                    title: 'Settings saved',
                    description: 'AI provider settings updated successfully',
                    variant: 'success',
                  });
                }}
                onSaveError={() => {
                  toast?.({
                    title: 'Error',
                    description: 'Failed to save AI provider settings',
                    variant: 'error',
                  });
                }}
              />
            </div>
          </div>
        ) : providerTabList.length === 0 ? (
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
            {/* Accounts Tab */}
            {activeTab === 'accounts' && (
              <>
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

                {/* Maintenance Actions */}
                <div className="flex items-center gap-2 mb-4 p-3 border rounded-lg dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Maintenance:
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        toast?.({
                          title: 'Running cleanup...',
                          description: 'Clearing expired cooldowns and fixing account states',
                          variant: 'info',
                        });
                        const response = await apiClient.post(`/accounts/cleanup?provider_id=${activeProvider}`);
                        const { stats, message } = response.data;
                        toast?.({
                          title: 'Cleanup complete',
                          description: message,
                          variant: 'success',
                        });
                        setRefreshKey(prev => prev + 1);
                      } catch (error) {
                        console.error('Cleanup failed:', error);
                        toast?.({
                          title: 'Cleanup failed',
                          description: 'Failed to run account cleanup',
                          variant: 'error',
                        });
                      }
                    }}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Fix Account States
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        toast?.({
                          title: 'Syncing credits...',
                          description: 'Fetching latest credit balances for all accounts',
                          variant: 'info',
                        });

                        // Get all accounts for this provider
                        const accountsForProvider = providerData.accounts;
                        let synced = 0;
                        let failed = 0;

                        for (const account of accountsForProvider) {
                          try {
                            await apiClient.post(`/accounts/${account.id}/sync-credits?force=true`);
                            synced++;
                          } catch (err) {
                            console.error(`Failed to sync account ${account.id}:`, err);
                            failed++;
                          }
                        }

                        toast?.({
                          title: 'Sync complete',
                          description: `Synced ${synced} accounts${failed > 0 ? `, ${failed} failed` : ''}`,
                          variant: synced > 0 ? 'success' : 'error',
                        });
                        setRefreshKey(prev => prev + 1);
                      } catch (error) {
                        console.error('Bulk sync failed:', error);
                        toast?.({
                          title: 'Sync failed',
                          description: 'Failed to sync credits',
                          variant: 'error',
                        });
                      }
                    }}
                    className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Sync All Credits
                  </button>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 ml-auto">
                    Use these tools to fix account states and refresh credit balances
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
              </>
            )}

            {/* Configuration Tab */}
            {activeTab === 'config' && providerSettings && (
              <div className="max-w-2xl">
                <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
                  {providerNames[activeProvider!] || activeProvider} Configuration
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
                  Configure automatic re-authentication and password management for this provider.
                </p>

                <div className="space-y-6">
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
              </div>
            )}

            {/* Lineage Tab (provider-specific) */}
            {activeTab === 'lineage' && sortedAccounts.length > 0 && (
              <ProviderSyncSection
                providerId={activeProvider!}
                providerName={providerNames[activeProvider!] || activeProvider!}
                accounts={sortedAccounts}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}


// ============================================================================
// Provider Sync Section Component (currently Pixverse-specific)
// ============================================================================

interface ProviderSyncSectionProps {
  providerId: string;
  providerName: string;
  accounts: ProviderAccount[];
}

function ProviderSyncSection({ providerId, providerName, accounts }: ProviderSyncSectionProps) {
  const toast = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    accounts[0]?.id ?? null
  );

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<SyncDryRunResponse | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);

  // Lineage rebuild state
  const [rebuilding, setRebuilding] = useState(false);

  // Keep selectedAccountId in sync with available accounts
  useEffect(() => {
    if (selectedAccountId === null && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    } else if (accounts.length > 0 && !accounts.find(a => a.id === selectedAccountId)) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const handleScanLibrary = async () => {
    if (!selectedAccountId) return;

    setScanning(true);
    try {
      const result = await getPixverseSyncDryRun(selectedAccountId, {
        limit: 200,
        includeImages: true,
      });
      setScanResult(result);
      toast.success('Library scan complete');
    } catch (error) {
      console.error('Scan failed:', error);
      toast.error(`Scan failed: ${error}`);
    } finally {
      setScanning(false);
    }
  };

  const handleImportMissing = async () => {
    if (!selectedAccountId) return;

    setImporting(true);
    try {
      const result = await syncPixverseAssets(selectedAccountId, {
        mode: 'both',
        limit: 200,
      });

      const totalCreated = result.videos.created + result.images.created;
      toast.success(`Imported ${result.videos.created} videos, ${result.images.created} images`);

      // Refresh scan results
      if (totalCreated > 0) {
        await handleScanLibrary();
      }
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(`Import failed: ${error}`);
    } finally {
      setImporting(false);
    }
  };

  const handleRebuildLineage = async () => {
    setRebuilding(true);
    try {
      const result = await refreshAssetLineage({
        providerId,
        clearExisting: true,
      });

      const totalNewEdges = result.results.reduce((sum, r) => sum + r.new_edges, 0);
      toast.success(`Rebuilt lineage for ${result.count} assets (${totalNewEdges} edges created)`);
    } catch (error) {
      console.error('Lineage rebuild failed:', error);
      toast.error(`Lineage rebuild failed: ${error}`);
    } finally {
      setRebuilding(false);
    }
  };

  const missingVideos = scanResult
    ? scanResult.videos.total_remote - scanResult.videos.existing_count
    : 0;
  const missingImages = scanResult?.images
    ? scanResult.images.total_remote - scanResult.images.existing_count
    : 0;

  return (
    <div className="max-w-3xl">
      <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
        {providerName} Library & Lineage
      </h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
        Manual tools for syncing your {providerName} library and rebuilding asset lineage data.
        These operations do not run automatically.
      </p>

      <div className="space-y-6">
        {/* Account selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Account:
          </label>
          <select
            value={selectedAccountId ?? ''}
            onChange={(e) => setSelectedAccountId(Number(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.nickname || acc.email}
              </option>
            ))}
          </select>
        </div>

        {/* Scan Results */}
        {scanResult && (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Videos</div>
              <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                {scanResult.videos.existing_count} / {scanResult.videos.total_remote}
              </div>
              <div className="text-xs text-neutral-500">
                {missingVideos > 0 ? `${missingVideos} missing` : 'All imported'}
              </div>
            </div>
            {scanResult.images && (
              <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Images</div>
                <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                  {scanResult.images.existing_count} / {scanResult.images.total_remote}
                </div>
                <div className="text-xs text-neutral-500">
                  {missingImages > 0 ? `${missingImages} missing` : 'All imported'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleScanLibrary}
            disabled={scanning || !selectedAccountId}
          >
            {scanning ? 'Scanning...' : 'Scan Library'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleImportMissing}
            disabled={importing || !selectedAccountId || (scanResult && missingVideos + missingImages === 0)}
          >
            {importing ? 'Importing...' : 'Import Missing Assets'}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRebuildLineage}
            disabled={rebuilding}
          >
            {rebuilding ? 'Rebuilding...' : 'Rebuild Lineage'}
          </Button>
        </div>

        <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-xs text-neutral-600 dark:text-neutral-400">
          <strong>Scan Library:</strong> Check how many remote items are already imported.{' '}
          <strong>Import Missing:</strong> Create Asset records for unimported items.{' '}
          <strong>Rebuild Lineage:</strong> Re-extract parent-child relationships from stored metadata.
        </div>
      </div>
    </div>
  );
}
