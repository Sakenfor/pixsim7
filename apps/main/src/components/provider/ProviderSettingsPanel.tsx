import { useState, useMemo, useEffect } from 'react';
import { Modal, FormField, Input, Button, useToast } from '@pixsim7/shared.ui';
import { useProviderCapacity } from '../../hooks/useProviderAccounts';
import { useProviders } from '../../hooks/useProviders';
import type { ProviderAccount } from '../../hooks/useProviderAccounts';
import { deleteAccount, toggleAccountStatus, updateAccount, dryRunPixverseSync, connectPixverseWithGoogle } from '../../lib/api/accounts';
import { apiClient } from '../../lib/api/client';
import { CompactAccountCard } from './CompactAccountCard';
import { getGoogleIdTokenViaGIS } from '../../lib/googleAuth';

interface EditAccountModalProps {
  account: ProviderAccount;
  onClose: () => void;
  onSave: (accountId: number, data: {
    email?: string;
    nickname?: string;
    api_key?: string;
    api_keys?: Array<{ id?: string; kind: string; value: string; priority?: number }>;
  }) => Promise<void>;
}

function EditAccountModal({ account, onClose, onSave }: EditAccountModalProps) {
  const [email, setEmail] = useState(account.email || '');
  const [nickname, setNickname] = useState(account.nickname || '');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyPaid, setApiKeyPaid] = useState('');
  const [clearOpenApiKey, setClearOpenApiKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: any = {};
      if (email !== account.email) updates.email = email;
      if (nickname !== account.nickname) updates.nickname = nickname;
      if (apiKey) updates.api_key = apiKey;
      if (clearOpenApiKey) {
        // Clear all OpenAPI keys
        updates.api_keys = [];
      } else if (apiKeyPaid) {
        // Single OpenAPI key entry for now
        updates.api_keys = [{ id: 'openapi_main', kind: 'openapi', value: apiKeyPaid, priority: 10 }];
      }
      
      if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }
      
      await onSave(account.id, updates);
      onClose();
    } catch (error) {
      console.error('Failed to update account:', error);
      alert(`Failed to update account: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Edit Account" size="lg">
      <div className="space-y-4">
        <FormField label="Email" size="md">
          <Input
            type="email"
            size="md"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="account@example.com"
          />
        </FormField>

        <FormField label="Nickname" optional size="md">
          <Input
            type="text"
            size="md"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="My Account"
          />
        </FormField>

        <FormField
          label="API Key / JWT Token"
          helpText="Leave empty to keep existing"
          size="md"
        >
          <Input
            type="text"
            size="md"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter new API key or JWT token"
            className="font-mono"
          />
          {account.has_jwt && (
            <p className="text-xs text-neutral-500 mt-1">
              Currently has JWT token
            </p>
          )}
        </FormField>

        <FormField
          label="OpenAPI Key (Pro/Paid)"
          helpText="For Pixverse: This is the OpenAPI key for paid accounts with higher limits"
          size="md"
        >
          <Input
            type="text"
            size="md"
            autoComplete="off"
            value={apiKeyPaid}
            onChange={(e) => setApiKeyPaid(e.target.value)}
            placeholder="Enter OpenAPI key for paid tier"
            className="font-mono"
          />
          {account.has_api_key_paid && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✓ Currently has OpenAPI key (Pro tier active)
            </p>
          )}
          {account.has_api_key_paid && (
            <label className="mt-1 flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
              <input
                type="checkbox"
                className="rounded border-neutral-300 dark:border-neutral-600"
                checked={clearOpenApiKey}
                onChange={(e) => setClearOpenApiKey(e.target.checked)}
              />
              <span>Clear stored OpenAPI key on save</span>
            </label>
          )}
        </FormField>

        {/* Account Status Info */}
        <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg">
          <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
            <div><strong>Provider:</strong> {account.provider_id}</div>
            <div><strong>Status:</strong> {account.status}</div>
            {account.has_cookies && <div>✓ Has cookies</div>}
            {account.jwt_expired && <div className="text-red-500">⚠ JWT expired</div>}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </Modal>
  );
}

interface DeleteConfirmModalProps {
  account: ProviderAccount;
  onClose: () => void;
  onConfirm: (accountId: number) => Promise<void>;
}

function DeleteConfirmModal({ account, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm(account.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Delete Account" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Are you sure you want to delete this account?
        </p>

        <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg">
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            {account.nickname || account.email}
          </div>
          {account.nickname && (
            <div className="text-xs text-neutral-500">{account.email}</div>
          )}
        </div>

        <p className="text-xs text-red-600 dark:text-red-400">
          This action cannot be undone.
        </p>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleDelete}
          disabled={deleting}
          className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </div>
    </Modal>
  );
}

interface AccountRowProps {
  account: ProviderAccount;
  onEditNickname: (account: ProviderAccount) => void;
  onToggleStatus: (account: ProviderAccount) => void;
  onDelete: (account: ProviderAccount) => void;
}

function AccountRow({ account, onEditNickname, onToggleStatus, onDelete }: AccountRowProps) {
  const isActive = account.status === 'ACTIVE';
  const isAtCapacity = account.current_processing_jobs >= account.max_concurrent_jobs;

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
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onEditNickname(account)}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            title="Edit nickname"
          >
            Edit
          </button>
          <button
            onClick={() => onToggleStatus(account)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              isActive
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
            title={isActive ? 'Disable account' : 'Enable account'}
          >
            {isActive ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={() => onDelete(account)}
            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            title="Delete account"
          >
            Delete
          </button>

          {/* Dev-only: Pixverse dry-run sync */}
          {account.provider_id === 'pixverse' && (
            <PixverseDryRunButton accountId={account.id} />
          )}
        </div>
      </td>
    </tr>
  );
}

function PixverseDryRunButton({ accountId }: { accountId: number }) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await dryRunPixverseSync(accountId, { limit: 10, offset: 0 });
      const existing = res.existing_count ?? 0;
      const total = res.total_remote ?? 0;
      toast.success(
        `Pixverse dry-run: ${existing} / ${total} videos already imported (first ${res.videos?.length ?? 0} checked).`
      );
      // For deeper inspection, leverage Dev Tools / network tab rather than UI spam.
      console.debug('Pixverse dry-run result', res);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to run Pixverse sync dry-run';
      toast.error(message);
      console.error('Pixverse dry-run error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-neutral-500 transition-colors"
      title="Dev: Dry-run Pixverse video sync (no changes)"
    >
      {loading ? 'Pixverse…' : 'Pixverse Dry-Run'}
    </button>
  );
}

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
  const [editingAccount, setEditingAccount] = useState<ProviderAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<ProviderAccount | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'credits' | 'lastUsed' | 'success'>('lastUsed');
  const [sortDesc, setSortDesc] = useState(true);

  // Provider-level settings
  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const toast = useToast();

  const handleSaveAccount = async (accountId: number, data: {
    email?: string;
    nickname?: string;
    api_key?: string;
    api_keys?: Array<{ id?: string; kind: string; value: string; priority?: number }>;
  }) => {
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

  const handleConnectGoogle = async (account: ProviderAccount) => {
    if (account.provider_id !== 'pixverse') return;

    const idToken = await getGoogleIdTokenViaGIS();
    if (!idToken) return;

    try {
      await connectPixverseWithGoogle(account.id, idToken);
      setRefreshKey(prev => prev + 1);
      if (toast && (toast as any).success) {
        (toast as any).success('Connected Pixverse account via Google');
      }
    } catch (error) {
      console.error('Failed to connect Pixverse via Google:', error);
      if (toast && (toast as any).error) {
        (toast as any).error('Failed to connect Pixverse via Google');
      } else {
        alert('Failed to connect Pixverse via Google');
      }
    }
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
          const aCredits = Object.values(a.credits).reduce((sum, v) => sum + v, 0);
          const bCredits = Object.values(b.credits).reduce((sum, v) => sum + v, 0);
          comparison = aCredits - bCredits;
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
          onClose={() => setEditingAccount(null)}
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
                  onEdit={() => setEditingAccount(account)}
                  onToggle={() => handleToggleStatus(account)}
                  onDelete={() => setDeletingAccount(account)}
                  onConnectGoogle={account.provider_id === 'pixverse' ? () => handleConnectGoogle(account) : undefined}
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
