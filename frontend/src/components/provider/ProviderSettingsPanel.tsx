import { useState } from 'react';
import { useProviderCapacity } from '../../hooks/useProviderAccounts';
import { useProviders } from '../../hooks/useProviders';
import type { ProviderAccount } from '../../hooks/useProviderAccounts';
import { deleteAccount, toggleAccountStatus, updateAccount } from '../../lib/api/accounts';

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-4">
          Edit Account
        </h3>

        <div className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="account@example.com"
              className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Nickname */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Nickname
              <span className="text-xs text-neutral-500 ml-2">(optional)</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="My Account"
              className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* API Key (Free/WebAPI) */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              API Key / JWT Token
              <span className="text-xs text-neutral-500 ml-2">(leave empty to keep existing)</span>
            </label>
            <input
              type="text"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter new API key or JWT token"
              className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            {account.has_jwt && (
              <p className="text-xs text-neutral-500 mt-1">
                Currently has JWT token
              </p>
            )}
          </div>

          {/* OpenAPI Key (Paid) */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              OpenAPI Key (Pro/Paid)
              <span className="text-xs text-neutral-500 ml-2">(leave empty to keep existing)</span>
            </label>
            <input
              type="text"
              autoComplete="off"
              value={apiKeyPaid}
              onChange={(e) => setApiKeyPaid(e.target.value)}
              placeholder="Enter OpenAPI key for paid tier"
              className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
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
            <p className="text-xs text-neutral-500 mt-1">
              For Pixverse: This is the OpenAPI key for paid accounts with higher limits
            </p>
          </div>

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
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">
          Delete Account
        </h3>

        <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">
          Are you sure you want to delete this account?
        </p>

        <div className="mb-6 p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg">
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            {account.nickname || account.email}
          </div>
          {account.nickname && (
            <div className="text-xs text-neutral-500">{account.email}</div>
          )}
        </div>

        <p className="text-xs text-red-600 dark:text-red-400 mb-6">
          This action cannot be undone.
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
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
        <div className="flex gap-1">
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
        </div>
      </td>
    </tr>
  );
}

export function ProviderSettingsPanel() {
  const { providers } = useProviders();
  const [refreshKey, setRefreshKey] = useState(0);
  const { capacity, loading, error, accounts } = useProviderCapacity(refreshKey);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<ProviderAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<ProviderAccount | null>(null);

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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
            Provider Settings
          </h2>
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
                    <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {providerData.accounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      onEditNickname={setEditingAccount}
                      onToggleStatus={handleToggleStatus}
                      onDelete={setDeletingAccount}
                    />
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
