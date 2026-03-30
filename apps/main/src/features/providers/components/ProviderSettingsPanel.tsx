import { Button, FormField, Input, useToast, ConfirmModal } from '@pixsim7/shared.ui';
import { useState, useMemo, useEffect } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';

import { useProviderCapacity } from '../hooks/useProviderAccounts';
import type { ProviderAccount } from '../hooks/useProviderAccounts';
import { useProviders } from '../hooks/useProviders';
import { useProviderSpecs } from '../hooks/useProviderSpecs';
import { deleteAccount, toggleAccountStatus, updateAccount } from '../lib/api/accounts';
import type { AccountUpdate } from '../lib/api/accounts';

import { AccountRow } from './AccountRow';
import { AIProviderSettings } from './AIProviderSettings';
import { CompactAccountCard } from './CompactAccountCard';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { EditAccountModal } from './EditAccountModal';

interface ProviderSettings {
  provider_id: string;
  global_password: string | null;
  auto_reauth_enabled: boolean;
  auto_reauth_max_retries: number;
}

type SidebarSelection =
  | { kind: 'overview' }
  | { kind: 'provider'; providerId: string; sub: 'accounts' | 'config' }
  | { kind: 'ai-providers' };

const LIVE_ACCOUNT_DIAGNOSTICS_POLL_MS = 250;
const PROVIDERS_ACCOUNTS_VIEW_MODE_STORAGE_KEY = 'providers-panel-accounts-view-mode';

function readStoredAccountsViewMode(): 'cards' | 'list' {
  try {
    const raw = localStorage.getItem(PROVIDERS_ACCOUNTS_VIEW_MODE_STORAGE_KEY);
    return raw === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

/* ------------------------------------------------------------------ */
/*  Sidebar helpers                                                    */
/* ------------------------------------------------------------------ */

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ProviderSidebarItem({
  providerId,
  providerName,
  activeCount,
  totalCount,
  isExpanded,
  selection,
  onToggleExpand,
  onSelect,
}: {
  providerId: string;
  providerName: string;
  activeCount: number;
  totalCount: number;
  isExpanded: boolean;
  selection: SidebarSelection;
  onToggleExpand: () => void;
  onSelect: (sub: 'accounts' | 'config') => void;
}) {
  const isActiveProvider =
    selection.kind === 'provider' && selection.providerId === providerId;
  const activeSub = isActiveProvider
    ? (selection as Extract<SidebarSelection, { kind: 'provider' }>).sub
    : null;

  return (
    <div>
      <button
        onClick={() => {
          if (!isExpanded) {
            onToggleExpand();
            onSelect('accounts');
          } else if (!isActiveProvider) {
            onSelect('accounts');
          } else {
            onToggleExpand();
          }
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-md transition-colors ${
          isActiveProvider
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
        }`}
      >
        <ChevronIcon expanded={isExpanded} />
        <span className="flex-1 truncate font-medium">{providerName}</span>
        <span className="text-[10px] tabular-nums opacity-70">
          {activeCount}/{totalCount}
        </span>
      </button>

      {isExpanded && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-neutral-200 dark:border-neutral-700">
          {([
            { key: 'accounts' as const, label: 'Accounts' },
            { key: 'config' as const, label: 'Configuration' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`w-full flex items-center gap-2 pl-3 pr-2 py-1.5 text-left text-[11px] rounded-r-md transition-colors ${
                activeSub === key
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview content                                                   */
/* ------------------------------------------------------------------ */

function OverviewContent({
  capacity,
  providerNames,
  onNavigate,
}: {
  capacity: Array<{
    provider_id: string;
    total_accounts: number;
    active_accounts: number;
    current_jobs: number;
    max_jobs: number;
    total_credits: number;
    credits_by_type: Record<string, number>;
    accounts: ProviderAccount[];
  }>;
  providerNames: Record<string, string>;
  onNavigate: (providerId: string) => void;
}) {
  const totals = useMemo(() => {
    const creditsByType: Record<string, number> = {};
    for (const c of capacity) {
      for (const [type, amount] of Object.entries(c.credits_by_type)) {
        creditsByType[type] = (creditsByType[type] || 0) + amount;
      }
    }
    return {
      accounts: capacity.reduce((s, c) => s + c.total_accounts, 0),
      active: capacity.reduce((s, c) => s + c.active_accounts, 0),
      jobs: capacity.reduce((s, c) => s + c.current_jobs, 0),
      maxJobs: capacity.reduce((s, c) => s + c.max_jobs, 0),
      credits: capacity.reduce((s, c) => s + c.total_credits, 0),
      creditsByType,
    };
  }, [capacity]);

  return (
    <div className="p-4">
      {/* Aggregate stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="p-3 border rounded-lg dark:border-neutral-700">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Total Accounts</div>
          <div className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">{totals.accounts}</div>
          <div className="text-xs text-neutral-500">{totals.active} active</div>
        </div>
        <div className="p-3 border rounded-lg dark:border-neutral-700">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Jobs Running</div>
          <div className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">
            {totals.jobs}/{totals.maxJobs}
          </div>
          <div className="text-xs text-neutral-500">
            {totals.maxJobs > 0 ? Math.round((totals.jobs / totals.maxJobs) * 100) : 0}% utilized
          </div>
        </div>
        <div className="p-3 border rounded-lg dark:border-neutral-700">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Credits</div>
          {Object.keys(totals.creditsByType).length > 1 ? (
            <div className="flex flex-col gap-0.5">
              {Object.entries(totals.creditsByType).map(([type, amount]) => (
                <div key={type} className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-neutral-800 dark:text-neutral-200">
                    {amount.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {type}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">
              {totals.credits.toLocaleString()}
            </div>
          )}
        </div>
        <div className="p-3 border rounded-lg dark:border-neutral-700">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Providers</div>
          <div className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">{capacity.length}</div>
        </div>
      </div>

      {/* Per-provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {capacity.map((cap) => {
          const utilizationPercent =
            cap.max_jobs > 0 ? Math.round((cap.current_jobs / cap.max_jobs) * 100) : 0;

          return (
            <button
              key={cap.provider_id}
              onClick={() => onNavigate(cap.provider_id)}
              className="p-4 border rounded-lg dark:border-neutral-700 text-left hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  {providerNames[cap.provider_id] || cap.provider_id}
                </span>
                <span className="text-xs text-neutral-500">
                  {cap.active_accounts}/{cap.total_accounts} active
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div>
                  <div className="text-neutral-500 dark:text-neutral-400">Jobs</div>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {cap.current_jobs}/{cap.max_jobs}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500 dark:text-neutral-400">Credits</div>
                  {Object.keys(cap.credits_by_type).length > 1 ? (
                    <div className="flex flex-col">
                      {Object.entries(cap.credits_by_type).map(([type, amount]) => (
                        <div key={type} className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {amount.toLocaleString()} <span className="font-normal text-[10px] text-neutral-500">{type}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {cap.total_credits.toLocaleString()}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-neutral-500 dark:text-neutral-400">Avg Success</div>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {cap.accounts.length > 0
                      ? Math.round(
                          (cap.accounts.reduce((sum, a) => sum + a.success_rate, 0) /
                            cap.accounts.length) *
                            100
                        )
                      : 0}%
                  </div>
                </div>
              </div>

              {/* Utilization bar */}
              <div>
                <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      utilizationPercent >= 90
                        ? 'bg-red-500'
                        : utilizationPercent >= 70
                          ? 'bg-amber-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${utilizationPercent}%` }}
                  />
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
                  {utilizationPercent}% utilization
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {capacity.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-sm text-neutral-500 mb-4">
            No provider accounts configured yet.
          </div>
          <div className="text-xs text-neutral-400 max-w-md">
            Install the browser extension and add accounts for Pixverse, Sora, or other providers to get started.
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main panel                                                         */
/* ------------------------------------------------------------------ */

export function ProviderSettingsPanel() {
  const { providers } = useProviders();
  const [refreshKey, setRefreshKey] = useState(0);
  const { capacity, loading, error, accounts } = useProviderCapacity(refreshKey);

  // Navigation
  const [selection, setSelection] = useState<SidebarSelection>({ kind: 'overview' });
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // Account editing / deleting
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingAccount, setEditingAccount] = useState<ProviderAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<ProviderAccount | null>(null);

  // Sorting & view mode
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'credits' | 'lastUsed' | 'success'>('lastUsed');
  const [sortDesc, setSortDesc] = useState(true);
  const [viewMode, setViewModeRaw] = useState<'cards' | 'list'>(readStoredAccountsViewMode);

  // Live diagnostics — auto-enabled when any account is selected
  const [liveSelectedAccountIds, setLiveSelectedAccountIds] = useState<Set<number>>(new Set());
  const [liveAccountOverrides, setLiveAccountOverrides] = useState<Record<number, ProviderAccount>>({});
  const [liveAccountUpdatedAt, setLiveAccountUpdatedAt] = useState<Record<number, number>>({});
  const [liveDiagnosticsPolling, setLiveDiagnosticsPolling] = useState(false);

  // Provider-level settings
  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const toast = useToast();

  // Deduplication confirmation
  const [dedupeConfirm, setDedupeConfirm] = useState<{
    providerId: string;
    duplicateCount: number;
    emailList: string;
  } | null>(null);

  // --- Handlers ---

  const handleSaveAccount = async (accountId: number, data: AccountUpdate) => {
    try {
      await updateAccount(accountId, data);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Error in handleSaveAccount:', error);
      throw error;
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

  const handleUpdateAccountPlan = async (account: ProviderAccount) => {
    if (account.provider_id !== 'pixverse') return;
    try {
      toast?.({
        title: 'Updating account...',
        description: `Refreshing plan limits for ${account.nickname || account.email}`,
        variant: 'info',
      });
      const res = await pixsimClient.post<{
        success?: boolean;
        max_concurrent_jobs?: number;
        message?: string;
        concurrency_source?: string | null;
        plan_gen_simultaneously?: number | null;
        plan_max_concurrent_jobs_raw?: unknown;
      }>(
        `/accounts/${account.id}/sync-plan`
      );
      const sourceLabel =
        res.concurrency_source === 'provider_gen_simultaneously'
          ? 'provider'
          : res.concurrency_source === 'sdk_normalized_or_fallback'
            ? 'sdk/fallback'
            : res.concurrency_source === 'backend_plan_type_fallback'
              ? 'backend fallback'
              : null;
      const sourceDetails =
        sourceLabel
          ? ` (${sourceLabel}${
              typeof res.plan_gen_simultaneously === 'number'
                ? `, gen_simultaneously=${res.plan_gen_simultaneously}`
                : res.plan_max_concurrent_jobs_raw != null
                  ? `, sdk_max=${String(res.plan_max_concurrent_jobs_raw)}`
                  : ''
            })`
          : '';
      if (res.success === false) {
        toast?.({
          title: 'Update failed',
          description: res.message || 'Failed to refresh account plan limits',
          variant: 'error',
        });
        return;
      }
      toast?.({
        title: 'Account updated',
        description:
          typeof res.max_concurrent_jobs === 'number'
            ? `Max jobs updated to ${res.max_concurrent_jobs}${sourceDetails}`
            : (res.message || 'Plan limits refreshed'),
        variant: 'success',
      });
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to update account plan:', error);
      toast?.({
        title: 'Update failed',
        description: 'Failed to refresh account plan limits',
        variant: 'error',
      });
    }
  };

  const loadProviderSettings = async (providerId: string) => {
    try {
      const settings = await pixsimClient.get<ProviderSettings>(`/providers/${providerId}/settings`);
      setProviderSettings(settings);
    } catch (error) {
      console.error('Failed to load provider settings:', error);
    }
  };

  const saveProviderSettings = async () => {
    if (!activeProvider || !providerSettings) return;

    setSavingSettings(true);
    try {
      await pixsimClient.patch<ProviderSettings>(`/providers/${activeProvider}/settings`, {
        global_password: providerSettings.global_password || null,
        auto_reauth_enabled: providerSettings.auto_reauth_enabled,
        auto_reauth_max_retries: providerSettings.auto_reauth_max_retries,
      });

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

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(field);
      setSortDesc(true);
    }
  };

  const setViewMode = (nextMode: 'cards' | 'list') => {
    setViewModeRaw(nextMode);
    try {
      localStorage.setItem(PROVIDERS_ACCOUNTS_VIEW_MODE_STORAGE_KEY, nextMode);
    } catch {
      // best effort only
    }
  };

  // --- Derived state ---

  const providerNames = providers.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.name;
    return acc;
  }, {});

  const providerList = providers.length
    ? providers.map((p) => ({ id: p.id, name: p.name }))
    : capacity.map((c) => ({ id: c.provider_id, name: providerNames[c.provider_id] || c.provider_id }));

  const activeProvider = selection.kind === 'provider' ? selection.providerId : null;
  const { specs: activeProviderSpecs } = useProviderSpecs(activeProvider ?? undefined);

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
          credits_by_type: {},
          accounts: [] as ProviderAccount[],
        }
      : null);
  const knownPromotionModelIds = useMemo(() => {
    const known = new Set<string>();
    const operationSpecs = activeProviderSpecs?.operation_specs ?? {};
    for (const operation of Object.values(operationSpecs)) {
      const parameters = Array.isArray(operation?.parameters) ? operation.parameters : [];
      for (const parameter of parameters) {
        if (parameter?.name !== 'model' || !Array.isArray(parameter?.enum)) continue;
        for (const model of parameter.enum) {
          if (typeof model === 'string' && model.trim()) known.add(model.trim());
        }
      }
    }
    return Array.from(known);
  }, [activeProviderSpecs]);

  const sortedAccounts = useMemo(() => {
    if (!providerData) return [];
    const accs = [...providerData.accounts];

    accs.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = (a.nickname || a.email).localeCompare(b.nickname || b.email);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'credits':
          comparison = a.total_credits - b.total_credits;
          break;
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

    return accs;
  }, [providerData, sortBy, sortDesc]);

  const displayedSortedAccounts = useMemo(
    () => sortedAccounts.map((account) => liveAccountOverrides[account.id] ?? account),
    [sortedAccounts, liveAccountOverrides]
  );

  const isProviderAccountsView = selection.kind === 'provider' && selection.sub === 'accounts';
  const liveDiagnosticsActive = liveSelectedAccountIds.size > 0;
  const liveTargetAccountIds = useMemo(() => {
    if (!isProviderAccountsView || !liveDiagnosticsActive) return [];
    const visibleIds = displayedSortedAccounts.map((account) => account.id);
    return visibleIds.filter((id) => liveSelectedAccountIds.has(id));
  }, [
    displayedSortedAccounts,
    isProviderAccountsView,
    liveDiagnosticsActive,
    liveSelectedAccountIds,
  ]);
  const liveTargetAccountIdsKey = liveTargetAccountIds.join(',');

  // --- Effects ---

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
        const account = await pixsimClient.get<ProviderAccount>(`/accounts/${editingAccountId}`);
        if (!cancelled) setEditingAccount(account);
      } catch (error) {
        console.error('Failed to load account details', error);
      }
    })();

    return () => { cancelled = true; };
  }, [editingAccountId, accounts]);

  useEffect(() => {
    setProviderSettings(null);
    if (activeProvider) {
      loadProviderSettings(activeProvider);
    }
  }, [activeProvider]);

  useEffect(() => {
    const visibleIds = new Set(sortedAccounts.map((account) => account.id));
    setLiveSelectedAccountIds((prev) => {
      const next = new Set<number>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [sortedAccounts]);

  useEffect(() => {
    const targetAccountIds = liveTargetAccountIdsKey
      ? liveTargetAccountIdsKey.split(',').map((id) => Number(id)).filter(Number.isFinite)
      : [];

    if (!isProviderAccountsView || !activeProvider || targetAccountIds.length === 0) {
      setLiveDiagnosticsPolling(false);
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const pollLiveAccounts = async () => {
      if (inFlight) return;
      inFlight = true;
      if (!cancelled) setLiveDiagnosticsPolling(true);

      try {
        const settled = await Promise.allSettled(
          targetAccountIds.map((accountId) =>
            pixsimClient.get<ProviderAccount>(`/accounts/${accountId}`)
          )
        );
        if (cancelled) return;

        const nextOverrides: Record<number, ProviderAccount> = {};
        const nextUpdatedAt: Record<number, number> = {};

        settled.forEach((result, index) => {
          const accountId = targetAccountIds[index];
          if (result.status === 'fulfilled') {
            nextOverrides[accountId] = result.value;
            nextUpdatedAt[accountId] = Date.now();
          }
        });

        if (Object.keys(nextOverrides).length > 0) {
          setLiveAccountOverrides((prev) => ({ ...prev, ...nextOverrides }));
          setLiveAccountUpdatedAt((prev) => ({ ...prev, ...nextUpdatedAt }));
        }
      } catch {
        // individual account failures handled by allSettled above
      } finally {
        inFlight = false;
        if (!cancelled) setLiveDiagnosticsPolling(false);
      }
    };

    void pollLiveAccounts();
    const intervalId = window.setInterval(pollLiveAccounts, LIVE_ACCOUNT_DIAGNOSTICS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeProvider, isProviderAccountsView, liveTargetAccountIdsKey]);

  // --- Loading / error ---

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

  // --- Content title ---

  const contentTitle =
    selection.kind === 'overview'
      ? 'Overview'
      : selection.kind === 'ai-providers'
        ? 'AI Providers'
        : selection.sub === 'accounts'
          ? `${providerNames[selection.providerId] || selection.providerId} \u2014 Accounts`
          : `${providerNames[selection.providerId] || selection.providerId} \u2014 Configuration`;

  // --- Render ---

  return (
    <div className="h-full w-full flex bg-white dark:bg-neutral-900">
      {/* Sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-neutral-200 dark:border-neutral-800 flex flex-col">
        <div className="flex-shrink-0 px-3 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Providers</h1>
          <button
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="px-2 py-1 text-[10px] bg-neutral-200 dark:bg-neutral-700 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
          >
            Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {/* Overview */}
          <button
            onClick={() => setSelection({ kind: 'overview' })}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-md transition-colors ${
              selection.kind === 'overview'
                ? 'bg-blue-500 text-white'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            Overview
          </button>

          {/* Provider items */}
          {providerList.map((tab) => {
            const cap = capacity.find((c) => c.provider_id === tab.id);
            return (
              <ProviderSidebarItem
                key={tab.id}
                providerId={tab.id}
                providerName={providerNames[tab.id] || tab.name || tab.id}
                activeCount={cap?.active_accounts ?? 0}
                totalCount={cap?.total_accounts ?? 0}
                isExpanded={expandedProviders.has(tab.id)}
                selection={selection}
                onToggleExpand={() => {
                  setExpandedProviders((prev) => {
                    const next = new Set(prev);
                    if (next.has(tab.id)) next.delete(tab.id);
                    else next.add(tab.id);
                    return next;
                  });
                }}
                onSelect={(sub) => {
                  setSelection({ kind: 'provider', providerId: tab.id, sub });
                  setExpandedProviders((prev) => new Set(prev).add(tab.id));
                }}
              />
            );
          })}

          {/* AI Providers */}
          <button
            onClick={() => setSelection({ kind: 'ai-providers' })}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-md transition-colors ${
              selection.kind === 'ai-providers'
                ? 'bg-blue-500 text-white'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            AI Providers
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Content header */}
        <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {contentTitle}
          </h2>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-auto" key={refreshKey}>
          {/* Overview */}
          {selection.kind === 'overview' && (
            <OverviewContent
              capacity={capacity}
              providerNames={providerNames}
              onNavigate={(providerId) => {
                setSelection({ kind: 'provider', providerId, sub: 'accounts' });
                setExpandedProviders((prev) => new Set(prev).add(providerId));
              }}
            />
          )}

          {/* AI Providers */}
          {selection.kind === 'ai-providers' && (
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
          )}

          {/* Provider — Accounts */}
          {selection.kind === 'provider' && selection.sub === 'accounts' && providerData && (
            <div className="p-4">
              {/* Provider summary + maintenance — compact strip */}
              <div className="flex items-center gap-3 mb-3 px-1 flex-wrap">
                {/* Stats */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">{providerData.active_accounts}</span>/{providerData.total_accounts} active
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-600">|</span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Jobs <span className="font-semibold text-neutral-800 dark:text-neutral-200">{providerData.current_jobs}/{providerData.max_jobs}</span>
                    {' '}({providerData.max_jobs > 0 ? Math.round((providerData.current_jobs / providerData.max_jobs) * 100) : 0}%)
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-600">|</span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Credits{' '}
                    {Object.keys(providerData.credits_by_type).length > 1 ? (
                      Object.entries(providerData.credits_by_type).map(([type, amount], i) => (
                        <span key={type}>
                          {i > 0 && ', '}
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">{amount.toLocaleString()}</span>
                          {' '}<span className="text-[10px]">{type}</span>
                        </span>
                      ))
                    ) : (
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">{providerData.total_credits.toLocaleString()}</span>
                    )}
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-600">|</span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Success <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {providerData.accounts.length > 0
                        ? Math.round(
                            (providerData.accounts.reduce((sum, acc) => sum + acc.success_rate, 0) /
                              providerData.accounts.length) *
                              100
                          )
                        : 0}%
                    </span>
                  </span>
                </div>
                {/* Maintenance actions */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    onClick={async () => {
                      try {
                        toast?.({
                          title: 'Running cleanup...',
                          description: 'Clearing expired cooldowns and fixing account states',
                          variant: 'info',
                        });
                        const { message } = await pixsimClient.post<{ message: string }>(
                          `/accounts/cleanup?provider_id=${activeProvider!}`
                        );
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
                    className="px-2 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    title="Clear expired cooldowns and fix account states"
                  >
                    Fix States
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        toast?.({
                          title: 'Syncing credits...',
                          description: 'Fetching latest credit balances for all accounts',
                          variant: 'info',
                        });

                        const accountsForProvider = providerData.accounts;
                        let synced = 0;
                        let failed = 0;

                        for (const account of accountsForProvider) {
                          try {
                            await pixsimClient.post(`/accounts/${account.id}/sync-credits?force=true`);
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
                    className="px-2 py-1 text-[11px] bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                    title="Fetch latest credit balances for all accounts"
                  >
                    Sync Credits
                  </button>
                  {activeProvider === 'pixverse' && (
                    <button
                      onClick={async () => {
                        try {
                          toast?.({
                            title: 'Updating accounts...',
                            description: 'Refreshing Pixverse plan/account limits (max jobs)',
                            variant: 'info',
                          });

                          const accountsForProvider = providerData.accounts;
                          let updated = 0;
                          let failed = 0;

                          for (const account of accountsForProvider) {
                            try {
                              await pixsimClient.post(`/accounts/${account.id}/sync-plan`);
                              updated++;
                            } catch (err) {
                              console.error(`Failed to update account ${account.id}:`, err);
                              failed++;
                            }
                          }

                          toast?.({
                            title: 'Account update complete',
                            description: `Updated ${updated} accounts${failed > 0 ? `, ${failed} failed` : ''}`,
                            variant: updated > 0 ? 'success' : 'error',
                          });
                          setRefreshKey(prev => prev + 1);
                        } catch (error) {
                          console.error('Account update failed:', error);
                          toast?.({
                            title: 'Update failed',
                            description: 'Failed to refresh account plan limits',
                            variant: 'error',
                          });
                        }
                      }}
                      className="px-2 py-1 text-[11px] bg-emerald-700 text-white rounded hover:bg-emerald-800 transition-colors"
                      title="Refresh Pixverse account plan details (updates max concurrent jobs)"
                    >
                      Update Acc
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        toast?.({
                          title: 'Checking for duplicates...',
                          description: 'Scanning for duplicate account entries',
                          variant: 'info',
                        });

                        const { duplicate_count, accounts } = await pixsimClient.get<{
                          duplicate_count: number;
                          accounts: Array<{ email: string }>;
                        }>(`/accounts/deduplicate?provider_id=${activeProvider!}`);

                        if (duplicate_count === 0) {
                          toast?.({
                            title: 'No duplicates found',
                            description: 'All accounts are unique',
                            variant: 'success',
                          });
                          return;
                        }

                        const emailList = accounts.map((a: { email: string }) => a.email).join(', ');
                        setDedupeConfirm({
                          providerId: activeProvider!,
                          duplicateCount: duplicate_count,
                          emailList,
                        });
                      } catch (error) {
                        console.error('Deduplication check failed:', error);
                        toast?.({
                          title: 'Check failed',
                          description: 'Failed to check for duplicate accounts',
                          variant: 'error',
                        });
                      }
                    }}
                    className="px-2 py-1 text-[11px] bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                    title="Scan for and remove duplicate account entries"
                  >
                    Dedupe
                  </button>
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
                    {label} {sortBy === key && (sortDesc ? '\u2193' : '\u2191')}
                  </button>
                ))}
                <div className="flex-1" />
                <div className="flex rounded-full overflow-hidden border border-neutral-200 dark:border-neutral-700">
                  {([
                    { id: 'cards' as const, icon: 'layoutGrid' as const, title: 'Card view' },
                    { id: 'list' as const, icon: 'rows' as const, title: 'List view' },
                  ]).map(({ id, icon, title }) => (
                    <button
                      key={id}
                      onClick={() => setViewMode(id)}
                      title={title}
                      className={`px-2 py-1 transition-colors ${
                        viewMode === id
                          ? 'bg-blue-600 text-white'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                      }`}
                    >
                      <Icon name={icon} size={12} color={viewMode === id ? '#fff' : undefined} />
                    </button>
                  ))}
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {displayedSortedAccounts.length} account{displayedSortedAccounts.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Accounts — Card View */}
              {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedSortedAccounts.map((account) => (
                    <CompactAccountCard
                      key={account.id}
                      account={account}
                      knownModelIds={knownPromotionModelIds}
                      onEdit={() => setEditingAccountId(account.id)}
                      onToggle={() => handleToggleStatus(account)}
                      onUpdateAccountPlan={() => handleUpdateAccountPlan(account)}
                      onDelete={() => setDeletingAccount(account)}
                      diagnostics={{
                        selected: liveSelectedAccountIds.has(account.id),
                        polling: liveDiagnosticsPolling,
                        liveUpdatedAt: liveAccountUpdatedAt[account.id] ?? null,
                        onToggleSelected: () => {
                          setLiveSelectedAccountIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(account.id)) next.delete(account.id);
                            else next.add(account.id);
                            return next;
                          });
                        },
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Accounts — List View */}
              {viewMode === 'list' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400">
                        <th className="px-3 py-2 font-medium">Name / Email</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Credits</th>
                        <th className="px-3 py-2 font-medium">Capacity</th>
                        <th className="px-3 py-2 font-medium">Badges</th>
                        <th className="px-3 py-2 font-medium">Stats</th>
                        <th className="px-3 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedSortedAccounts.map((account) => (
                        <AccountRow
                          key={account.id}
                          account={account}
                          knownModelIds={knownPromotionModelIds}
                          onEdit={(a) => setEditingAccountId(a.id)}
                          onToggleStatus={(a) => handleToggleStatus(a)}
                          onUpdateAccountPlan={(a) => handleUpdateAccountPlan(a)}
                          onDelete={(a) => setDeletingAccount(a)}
                          onRefresh={() => setRefreshKey((prev) => prev + 1)}
                          diagnostics={{
                            selected: liveSelectedAccountIds.has(account.id),
                            polling: liveDiagnosticsPolling,
                            liveUpdatedAt: liveAccountUpdatedAt[account.id] ?? null,
                            onToggleSelected: () => {
                              setLiveSelectedAccountIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(account.id)) next.delete(account.id);
                                else next.add(account.id);
                                return next;
                              });
                            },
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {displayedSortedAccounts.length === 0 && (
                <div className="text-center py-12 text-sm text-neutral-500">
                  No accounts found for this provider
                </div>
              )}
            </div>
          )}

          {/* Provider — Configuration */}
          {selection.kind === 'provider' && selection.sub === 'config' && providerSettings && (
            <div className="p-4">
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
            </div>
          )}
        </div>
      </div>

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

      <ConfirmModal
        isOpen={!!dedupeConfirm}
        title="Remove Duplicate Accounts"
        message={
          dedupeConfirm
            ? `Found ${dedupeConfirm.duplicateCount} duplicate account(s) to remove: ${dedupeConfirm.emailList}. The most recently used account for each email will be kept.`
            : ''
        }
        confirmText="Remove Duplicates"
        onConfirm={async () => {
          if (!dedupeConfirm) return;
          try {
            const { deleted } = await pixsimClient.post<{ deleted: number }>(
              `/accounts/deduplicate?provider_id=${dedupeConfirm.providerId}`
            );
            toast?.({
              title: 'Deduplication complete',
              description: `Removed ${deleted} duplicate account(s)`,
              variant: 'success',
            });
            setRefreshKey(prev => prev + 1);
          } catch (error) {
            console.error('Deduplication failed:', error);
            toast?.({
              title: 'Deduplication failed',
              description: 'Failed to remove duplicate accounts',
              variant: 'error',
            });
          }
          setDedupeConfirm(null);
        }}
        onCancel={() => setDedupeConfirm(null)}
        variant="danger"
      />
    </div>
  );
}
