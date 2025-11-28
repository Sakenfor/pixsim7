import type { ProviderAccount } from '../../hooks/useProviderAccounts';

interface CompactAccountCardProps {
  account: ProviderAccount;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

export function CompactAccountCard({
  account,
  onEdit,
  onToggle,
  onDelete,
}: CompactAccountCardProps) {
  const isActive = account.status === 'active';
  const isAtCapacity = account.current_processing_jobs >= account.max_concurrent_jobs;
  // Use backend-provided total_credits instead of recalculating
  const totalCredits = account.total_credits;

  const statusConfig = {
    active: {
      color: 'bg-green-500',
      label: 'Active',
      textColor: 'text-green-600 dark:text-green-400',
      badgeBg: 'bg-green-500/10',
      badgeBorder: 'border-green-500/20',
      badgeText: 'text-green-600 dark:text-green-400'
    },
    exhausted: {
      color: 'bg-red-500',
      label: 'Exhausted',
      textColor: 'text-red-600 dark:text-red-400',
      badgeBg: 'bg-red-500/10',
      badgeBorder: 'border-red-500/20',
      badgeText: 'text-red-600 dark:text-red-400'
    },
    error: {
      color: 'bg-orange-500',
      label: 'Error',
      textColor: 'text-orange-600 dark:text-orange-400',
      badgeBg: 'bg-orange-500/10',
      badgeBorder: 'border-orange-500/20',
      badgeText: 'text-orange-600 dark:text-orange-400'
    },
    disabled: {
      color: 'bg-neutral-400',
      label: 'Disabled',
      textColor: 'text-neutral-600 dark:text-neutral-500',
      badgeBg: 'bg-neutral-500/10',
      badgeBorder: 'border-neutral-500/20',
      badgeText: 'text-neutral-600 dark:text-neutral-400'
    },
    rate_limited: {
      color: 'bg-amber-500',
      label: 'Rate Limited',
      textColor: 'text-amber-600 dark:text-amber-400',
      badgeBg: 'bg-amber-500/10',
      badgeBorder: 'border-amber-500/20',
      badgeText: 'text-amber-600 dark:text-amber-400'
    },
  };

  const status = statusConfig[account.status as keyof typeof statusConfig] || statusConfig.disabled;

  return (
    <div className="group relative bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-600 transition-all">
      {/* Top Row: Name & Status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Status Dot */}
            <div className={`w-2 h-2 rounded-full ${status.color} flex-shrink-0`} title={status.label} />

            {/* Name */}
            <div className="font-medium text-sm text-neutral-800 dark:text-neutral-200 truncate">
              {account.nickname || account.email}
            </div>

            {/* Badges */}
            <div className="flex gap-1 flex-shrink-0">
              {/* Status Badge */}
              <span className={`px-1.5 py-0.5 text-[9px] font-bold ${status.badgeBg} ${status.badgeText} rounded border ${status.badgeBorder}`}>
                {status.label.toUpperCase()}
              </span>

              {account.has_api_key_paid && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded border border-purple-500/20">
                  PRO
                </span>
              )}
              {account.jwt_expired && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 rounded border border-red-500/20">
                  EXP
                </span>
              )}
              {isAtCapacity && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded border border-amber-500/20">
                  FULL
                </span>
              )}
            </div>
          </div>

          {/* Email (if nickname exists) */}
          {account.nickname && (
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
              {account.email}
            </div>
          )}
        </div>

        {/* Action Buttons (show on hover) */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={onToggle}
            className={`p-1 text-xs rounded hover:bg-opacity-20 ${
              isActive
                ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                : 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
            }`}
            title={isActive ? 'Disable' : 'Enable'}
          >
            {isActive ? '⏸' : '▶'}
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            title="Delete"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        {/* Credits */}
        <div className="flex flex-col">
          <span className="text-neutral-500 dark:text-neutral-400">Credits</span>
          <span
            className={`font-mono font-semibold ${
              totalCredits === 0 ? 'text-red-500' : 'text-neutral-800 dark:text-neutral-200'
            }`}
          >
            {totalCredits.toLocaleString()}
          </span>
        </div>

        {/* Jobs */}
        <div className="flex flex-col">
          <span className="text-neutral-500 dark:text-neutral-400">Jobs</span>
          <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
            {account.current_processing_jobs}/{account.max_concurrent_jobs}
          </span>
        </div>

        {/* Success Rate */}
        <div className="flex flex-col">
          <span className="text-neutral-500 dark:text-neutral-400">Success</span>
          <span
            className={`font-mono font-semibold ${
              account.success_rate >= 0.8
                ? 'text-green-600 dark:text-green-400'
                : account.success_rate >= 0.5
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {(account.success_rate * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Bottom Row: Generated Count */}
      <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-700 flex justify-between items-center text-[10px] text-neutral-500 dark:text-neutral-400">
        <span>{account.total_videos_generated} generated</span>
        {account.last_used && (
          <span title={new Date(account.last_used).toLocaleString()}>
            Last: {new Date(account.last_used).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
