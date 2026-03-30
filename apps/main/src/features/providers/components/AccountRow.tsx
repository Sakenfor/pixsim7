/**
 * AccountRow Component
 *
 * Table row for displaying a provider account with status, credits, and actions.
 */

import { useToast } from '@pixsim7/shared.ui';
import { useState, useEffect } from 'react';

import { Icon } from '@lib/icons';

import type { ProviderAccount } from '../hooks/useProviderAccounts';
import { dryRunPixverseSync, createApiKey, getAccountStats } from '../lib/api/accounts';
import { isPromotionActive } from '../lib/promotionCatalog';

import { AccountInfoModal } from './AccountInfoModal';
import type { AccountDiagnosticsProps } from './CompactAccountCard';
import { LivePollBadge } from './LivePollBadge';
import { PromotionDetailsPopover } from './PromotionDetailsPopover';

/** Status color mapping */
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
  exhausted: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
  error: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400',
  disabled: 'bg-neutral-100 dark:bg-neutral-800/30 text-neutral-600 dark:text-neutral-500',
  rate_limited: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400',
};

interface AccountRowProps {
  account: ProviderAccount;
  knownModelIds?: string[];
  onEdit: (account: ProviderAccount) => void;
  onToggleStatus: (account: ProviderAccount) => void;
  onUpdateAccountPlan?: (account: ProviderAccount) => void;
  onDelete: (account: ProviderAccount) => void;
  onRefresh?: () => void;
  diagnostics?: AccountDiagnosticsProps;
}

export function AccountRow({
  account,
  knownModelIds,
  onEdit,
  onToggleStatus,
  onUpdateAccountPlan,
  onDelete,
  onRefresh,
  diagnostics,
}: AccountRowProps) {
  const normalizedStatus = account.status.toLowerCase();
  const isActive = normalizedStatus === 'active';
  const isAtCapacity = account.current_processing_jobs >= account.max_concurrent_jobs;
  const statusColor = STATUS_COLORS[normalizedStatus] || STATUS_COLORS.disabled;
  const promotions = (account.promotions && typeof account.promotions === 'object')
    ? account.promotions as Record<string, unknown>
    : {};
  const promotionCount = Object.keys(promotions).length;
  const activePromotionCount = Object.values(promotions).filter((value) => isPromotionActive(value)).length;

  const [accountStats, setAccountStats] = useState<{ invited_count: number; user_info: Record<string, any> } | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Fetch account stats for Pixverse accounts
  useEffect(() => {
    if (account.provider_id === 'pixverse') {
      getAccountStats(account.id)
        .then(setAccountStats)
        .catch(err => console.error('Failed to fetch account stats:', err));
    }
  }, [account.id, account.provider_id]);

  return (
    <>
      {showInfoModal && (
        <AccountInfoModal
          accountId={account.id}
          accountEmail={account.email}
          onClose={() => setShowInfoModal(false)}
        />
      )}
    <tr
      className={`border-b dark:border-neutral-700 cursor-pointer transition-colors ${
        diagnostics?.selected
          ? 'bg-blue-50/60 dark:bg-blue-900/15 hover:bg-blue-50 dark:hover:bg-blue-900/20'
          : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
      }`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, input, label')) return;
        diagnostics?.onToggleSelected();
      }}
    >
      {/* Name/Email */}
      <td className="px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <div className="font-medium text-neutral-800 dark:text-neutral-200">
            {account.nickname || account.email}
          </div>
          {diagnostics?.selected && (
            <LivePollBadge polling={diagnostics.polling} liveUpdatedAt={diagnostics.liveUpdatedAt} />
          )}
        </div>
        {account.nickname && (
          <div className="text-xs text-neutral-500">{account.email}</div>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-2">
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor}`}>
          {account.status}
        </span>
      </td>

      {/* Credits */}
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

      {/* Capacity */}
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

      {/* Badges */}
      <td className="px-3 py-2 text-sm">
        <div className="flex flex-col gap-0.5 text-xs">
          {(account as any).plan_tier >= 2 && (
            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400 rounded w-fit">
              PRO
            </span>
          )}
          {(account as any).plan_tier === 1 && (
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded w-fit">
              STD
            </span>
          )}
          {account.jwt_expired && (
            <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded w-fit">
              JWT EXPIRED
            </span>
          )}
          {accountStats && accountStats.invited_count > 0 && (
            <span
              className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded w-fit cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800/40"
              onClick={() => setShowInfoModal(true)}
              title={`${accountStats.invited_count} invited user${accountStats.invited_count === 1 ? '' : 's'}`}
            >
              <span className="inline-flex items-center gap-1">
                <Icon name="users" size={11} />
                {accountStats.invited_count}
              </span>
            </span>
          )}
          {promotionCount > 0 && (
            <PromotionDetailsPopover
              promotions={promotions}
              knownModelIds={knownModelIds}
              title={`Promotions • ${account.nickname || account.email}`}
              triggerClassName="w-fit px-1.5 py-0.5"
              triggerTitle="View promotion details"
            >
              <span className="inline-flex items-center gap-1">
                <Icon name="sparkles" size={10} />
                {activePromotionCount > 0 ? activePromotionCount : promotionCount}
              </span>
            </PromotionDetailsPopover>
          )}
        </div>
      </td>

      {/* Stats */}
      <td className="px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400">
        <div className="text-xs">Success: {(account.success_rate * 100).toFixed(0)}%</div>
        <div className="text-xs">Generated: {account.total_videos_generated}</div>
      </td>

      {/* Actions */}
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onEdit(account)}
            className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
            title="Edit account"
            aria-label="Edit account"
          >
            <Icon name="edit" size={14} />
          </button>
          <button
            onClick={() => onToggleStatus(account)}
            className={`p-1.5 rounded transition-colors ${
              isActive
                ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                : 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
            }`}
            title={isActive ? 'Disable account' : 'Enable account'}
            aria-label={isActive ? 'Disable account' : 'Enable account'}
          >
            <Icon name={isActive ? 'pause' : 'play'} size={14} />
          </button>
          <button
            onClick={() => onDelete(account)}
            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
            title="Delete account"
            aria-label="Delete account"
          >
            <Icon name="trash2" size={14} />
          </button>

          {/* Pixverse-specific buttons */}
          {account.provider_id === 'pixverse' && (
            <>
              <button
                onClick={() => setShowInfoModal(true)}
                className="p-1.5 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded transition-colors"
                title="View account details and invited users"
                aria-label="View account details and invited users"
              >
                <Icon name="info" size={14} />
              </button>
              <PixverseDryRunButton accountId={account.id} />
              {onUpdateAccountPlan && (
                <button
                  onClick={() => onUpdateAccountPlan(account)}
                  className="p-1.5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors"
                  title="Refresh Pixverse plan limits (max jobs)"
                  aria-label="Refresh Pixverse plan limits"
                >
                  <Icon name="refresh" size={14} />
                </button>
              )}
              {!account.has_api_key_paid && account.has_jwt && (
                <CreateApiKeyButton accountId={account.id} onSuccess={onRefresh} />
              )}
            </>
          )}
        </div>
      </td>
    </tr>
    </>
  );
}

/** Button for running Pixverse sync dry-run (dev tool) */
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
      className="p-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors disabled:text-neutral-500 disabled:hover:bg-transparent"
      title="Dev: Dry-run Pixverse video sync (no changes)"
      aria-label="Run Pixverse dry-run sync"
    >
      <Icon name={loading ? 'loading' : 'flask'} size={14} className={loading ? 'animate-spin' : undefined} />
    </button>
  );
}

/** Button for creating Pixverse OpenAPI key */
function CreateApiKeyButton({ accountId, onSuccess }: { accountId: number; onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await createApiKey(accountId);
      if (res.already_exists) {
        toast.info('API key already exists for this account');
      } else {
        toast.success('API key created! Status polling will now be faster.');
      }
      onSuccess?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to create API key';
      toast.error(message);
      console.error('Create API key error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors disabled:text-neutral-500 disabled:hover:bg-transparent"
      title="Create OpenAPI key for faster status polling"
      aria-label="Create OpenAPI key"
    >
      <Icon name={loading ? 'loading' : 'key'} size={14} className={loading ? 'animate-spin' : undefined} />
    </button>
  );
}
