import { useProviderCapacity } from '@/hooks/useProviderAccounts';
import { useProviders } from '@/hooks/useProviders';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export function ProviderOverviewModule() {
  const { providers } = useProviders();
  const { capacity, loading, error } = useProviderCapacity();
  const openFloatingPanel = useWorkspaceStore(s => s.openFloatingPanel);

  const openFullSettings = () => {
    openFloatingPanel('providers', { width: 900, height: 700 });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <span className="text-sm text-neutral-500">Loading providers...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-600 dark:text-red-400">
          Error: {error}
        </div>
      </div>
    );
  }

  // Get provider names map
  const providerNames = providers.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.name;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Provider Capacity
        </h3>
        <button
          onClick={openFullSettings}
          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Open Full Settings
        </button>
      </div>

      {/* Provider capacity cards */}
      {capacity.length === 0 ? (
        <div className="text-sm text-neutral-500 text-center py-4">
          No accounts configured. Add accounts from browser extension.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {capacity.map((cap) => {
            const isAtCapacity = cap.current_jobs >= cap.max_jobs;
            const utilizationPercent = cap.max_jobs > 0
              ? Math.round((cap.current_jobs / cap.max_jobs) * 100)
              : 0;

            return (
              <div
                key={cap.provider_id}
                onClick={openFullSettings}
                className="border rounded-lg p-3 bg-neutral-50/50 dark:bg-neutral-800/50 hover:bg-neutral-100/50 dark:hover:bg-neutral-800/80 transition-colors cursor-pointer"
              >
                {/* Provider name and status */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {providerNames[cap.provider_id] || cap.provider_id}
                    </span>
                    {isAtCapacity && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 rounded">
                        AT CAPACITY
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {cap.active_accounts}/{cap.total_accounts} active
                  </span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-neutral-500 dark:text-neutral-400">Jobs</div>
                    <div className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
                      {cap.current_jobs}/{cap.max_jobs}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500 dark:text-neutral-400">Credits</div>
                    <div className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
                      {cap.total_credits.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Utilization bar */}
                <div className="mt-2">
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
              </div>
            );
          })}
        </div>
      )}

      {/* Quick stats summary */}
      {capacity.length > 0 && (
        <div className="pt-2 border-t text-xs text-neutral-600 dark:text-neutral-400">
          <div className="flex justify-between">
            <span>Total Accounts:</span>
            <span className="font-semibold">
              {capacity.reduce((sum, c) => sum + c.total_accounts, 0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Total Jobs Running:</span>
            <span className="font-semibold">
              {capacity.reduce((sum, c) => sum + c.current_jobs, 0)} / {capacity.reduce((sum, c) => sum + c.max_jobs, 0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Total Credits:</span>
            <span className="font-semibold">
              {capacity.reduce((sum, c) => sum + c.total_credits, 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
