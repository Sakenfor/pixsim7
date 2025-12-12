/**
 * AccountRow Component
 *
 * Table row for displaying a provider account with status, credits, and actions.
 */

import { useState } from 'react';
import { useToast } from '@pixsim7/shared.ui';
import type { ProviderAccount } from '../hooks/useProviderAccounts';
import { dryRunPixverseSync } from '../lib/api/accounts';

/** Status color mapping */
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
  EXHAUSTED: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
  ERROR: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400',
  DISABLED: 'bg-neutral-100 dark:bg-neutral-800/30 text-neutral-600 dark:text-neutral-500',
  RATE_LIMITED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400',
};

interface AccountRowProps {
  account: ProviderAccount;
  onEdit: (account: ProviderAccount) => void;
  onToggleStatus: (account: ProviderAccount) => void;
  onDelete: (account: ProviderAccount) => void;
}

export function AccountRow({ account, onEdit, onToggleStatus, onDelete }: AccountRowProps) {
  const isActive = account.status === 'ACTIVE';
  const isAtCapacity = account.current_processing_jobs >= account.max_concurrent_jobs;
  const statusColor = STATUS_COLORS[account.status] || STATUS_COLORS.DISABLED;

  return (
    <tr className="border-b dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
      {/* Name/Email */}
      <td className="px-3 py-2 text-sm">
        <div className="font-medium text-neutral-800 dark:text-neutral-200">
          {account.nickname || account.email}
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
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            title="Edit account"
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
      className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-neutral-500 transition-colors"
      title="Dev: Dry-run Pixverse video sync (no changes)"
    >
      {loading ? 'Pixverse…' : 'Pixverse Dry-Run'}
    </button>
  );
}
