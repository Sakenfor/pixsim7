/**
 * Generations Panel
 *
 * Dedicated panel for tracking and managing generation jobs.
 * Shows status, allows filtering, and provides retry/open actions.
 */
import { useMemo, useState, useCallback } from 'react';
import { useGenerationsStore } from '@/stores/generationsStore';
import { useRecentGenerations } from '@/hooks/useRecentGenerations';
import { retryGeneration, cancelGeneration, getGeneration, type GenerationResponse } from '@/lib/api/generations';
import { Icons, ThemedIcon } from '@/lib/icons';
import { getGenerationStatusDisplay } from '@/lib/generation/generationAssetMapping';

type StatusFilter = 'all' | 'active' | 'failed' | 'completed';
type ProviderFilter = 'all' | string;

export interface GenerationsPanelProps {
  onOpenAsset?: (assetId: number) => void;
}

export function GenerationsPanel({ onOpenAsset }: GenerationsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch recent generations (shared hook)
  const { isLoading, refresh: handleRefresh } = useRecentGenerations({ limit: 200 });

  // Get generations Map (stable reference)
  const generationsMap = useGenerationsStore(state => state.generations);

  // Convert to array only when Map changes
  const allGenerations = useMemo(
    () => Array.from(generationsMap.values()),
    [generationsMap]
  );

  // Get unique providers
  const providers = useMemo(() => {
    const providerSet = new Set(allGenerations.map(g => g.provider_id));
    return Array.from(providerSet).sort();
  }, [allGenerations]);

  // Filter generations
  const filteredGenerations = useMemo(() => {
    let filtered = allGenerations;

    // Status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter(g => ['pending', 'queued', 'processing'].includes(g.status));
    } else if (statusFilter === 'failed') {
      filtered = filtered.filter(g => g.status === 'failed');
    } else if (statusFilter === 'completed') {
      filtered = filtered.filter(g => g.status === 'completed');
    }

    // Provider filter
    if (providerFilter !== 'all') {
      filtered = filtered.filter(g => g.provider_id === providerFilter);
    }

    // Search filter (search in prompt)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g =>
        g.final_prompt?.toLowerCase().includes(query) ||
        g.name?.toLowerCase().includes(query) ||
        g.description?.toLowerCase().includes(query)
      );
    }

    // Sort by created_at descending (most recent first)
    return filtered.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [allGenerations, statusFilter, providerFilter, searchQuery]);

  // Count by status
  const statusCounts = useMemo(() => {
    return {
      all: allGenerations.length,
      active: allGenerations.filter(g => ['pending', 'queued', 'processing'].includes(g.status)).length,
      failed: allGenerations.filter(g => g.status === 'failed').length,
      completed: allGenerations.filter(g => g.status === 'completed').length,
    };
  }, [allGenerations]);

  const handleRetry = useCallback(async (id: number) => {
    try {
      const newGeneration = await retryGeneration(id);
      // Add the new generation to the store
      useGenerationsStore.getState().addOrUpdate(newGeneration);
    } catch (error) {
      console.error('Failed to retry generation:', error);
      alert('Failed to retry generation');
    }
  }, []);

  const handleCancel = useCallback(async (id: number) => {
    try {
      const updated = await cancelGeneration(id);
      // Update store with cancelled status
      useGenerationsStore.getState().addOrUpdate(updated);
    } catch (error) {
      console.error('Failed to cancel generation:', error);
      alert('Failed to cancel generation');
    }
  }, []);

  const handleOpenAsset = useCallback((assetId: number) => {
    onOpenAsset?.(assetId);
  }, [onOpenAsset]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <h2 className="text-lg font-semibold mb-3">Generations</h2>

        {/* Filters row */}
        <div className="flex gap-2 items-center flex-wrap">
          {/* Status filter */}
          <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
            {(['all', 'active', 'failed', 'completed'] as const).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  statusFilter === status
                    ? 'bg-white dark:bg-neutral-700 shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className="ml-1.5 text-neutral-500 dark:text-neutral-500">
                  {statusCounts[status]}
                </span>
              </button>
            ))}
          </div>

          {/* Provider filter */}
          {providers.length > 1 && (
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            >
              <option value="all">All Providers</option>
              {providers.map(provider => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
          )}

          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="mb-4 flex justify-center">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-neutral-600 dark:text-neutral-400">
              Loading generations...
            </p>
          </div>
        ) : filteredGenerations.length === 0 ? (
          <div className="text-center py-16">
            <div className="mb-4 flex justify-center">
              <Icons.zap size={48} className="text-neutral-400" />
            </div>
            <p className="text-neutral-600 dark:text-neutral-400">
              {allGenerations.length === 0
                ? 'No generations yet'
                : 'No generations match the selected filters'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredGenerations.map(generation => (
              <GenerationItem
                key={generation.id}
                generation={generation}
                onRetry={handleRetry}
                onCancel={handleCancel}
                onOpenAsset={handleOpenAsset}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface GenerationItemProps {
  generation: GenerationResponse;
  onRetry: (id: number) => void;
  onCancel: (id: number) => void;
  onOpenAsset: (assetId: number) => void;
}

function GenerationItem({ generation, onRetry, onCancel, onOpenAsset }: GenerationItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const statusDisplay = getGenerationStatusDisplay(generation.status);
  const isActive = ['pending', 'queued', 'processing'].includes(generation.status);
  const canRetry = generation.status === 'failed';
  const canCancel = isActive;

  // Manual refresh for debugging stuck generations
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const updated = await getGeneration(generation.id);
      useGenerationsStore.getState().addOrUpdate(updated);
    } catch (error) {
      console.error('Failed to refresh generation:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [generation.id]);

  // Retry with loading state
  const handleRetryClick = useCallback(async () => {
    setIsRetrying(true);
    try {
      await onRetry(generation.id);
    } finally {
      setIsRetrying(false);
    }
  }, [generation.id, onRetry]);

  // Cancel with loading state
  const handleCancelClick = useCallback(async () => {
    setIsCancelling(true);
    try {
      await onCancel(generation.id);
    } finally {
      setIsCancelling(false);
    }
  }, [generation.id, onCancel]);

  // Truncate prompt
  const promptPreview = generation.final_prompt
    ? generation.final_prompt.length > 80
      ? generation.final_prompt.substring(0, 80) + '...'
      : generation.final_prompt
    : generation.name || 'Untitled generation';

  // Format time
  const timeAgo = useMemo(() => {
    const now = Date.now();
    const created = new Date(generation.created_at).getTime();
    const diff = now - created;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }, [generation.created_at]);

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors">
      {/* Main row */}
      <div className="flex items-start gap-3 p-3">
        {/* Status icon */}
        <div className={`flex-shrink-0 mt-0.5 ${statusDisplay.color}`}>
          <ThemedIcon name={statusDisplay.icon} size={18} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Prompt preview */}
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1 truncate">
            {promptPreview}
          </p>

          {/* Metadata row */}
          <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <span className="font-medium">{generation.provider_id}</span>
            <span className="text-neutral-400 dark:text-neutral-600">•</span>
            <span>{generation.operation_type}</span>
            <span className="text-neutral-400 dark:text-neutral-600">•</span>
            <span>{timeAgo}</span>
            {generation.retry_count > 0 && (
              <>
                <span className="text-neutral-400 dark:text-neutral-600">•</span>
                <span className="text-amber-600 dark:text-amber-400">
                  {generation.retry_count} {generation.retry_count === 1 ? 'retry' : 'retries'}
                </span>
              </>
            )}
          </div>

          {/* Error message (when collapsed) */}
          {!isExpanded && generation.error_message && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate">
              {generation.error_message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex gap-1">
          {/* Expand/collapse button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
            title={isExpanded ? 'Show less' : 'Show details'}
          >
            <ThemedIcon
              name={isExpanded ? 'chevronUp' : 'chevronDown'}
              size={14}
              className="text-neutral-600 dark:text-neutral-400"
            />
          </button>

          {/* Refresh button (for debugging stuck generations) */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
            title="Refresh status from backend"
          >
            <ThemedIcon
              name="refresh"
              size={14}
              className={`text-neutral-600 dark:text-neutral-400 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>

          {generation.asset_id && (
            <button
              onClick={() => onOpenAsset(generation.asset_id!)}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
              title="Open asset"
            >
              <ThemedIcon name="externalLink" size={14} className="text-neutral-600 dark:text-neutral-400" />
            </button>
          )}
          {canRetry && (
            <button
              onClick={handleRetryClick}
              disabled={isRetrying}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
              title="Retry generation"
            >
              <ThemedIcon
                name="refreshCw"
                size={14}
                className={`text-blue-600 dark:text-blue-400 ${isRetrying ? 'animate-spin' : ''}`}
              />
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancelClick}
              disabled={isCancelling}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
              title="Cancel generation"
            >
              <ThemedIcon
                name="x"
                size={14}
                className={`text-red-600 dark:text-red-400 ${isCancelling ? 'opacity-50' : ''}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-950/50 space-y-3">
          {/* Debug info for stuck generations */}
          {isActive && generation.started_at && (
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
              <div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
                ⏱️ Processing Duration
              </div>
              <div className="text-xs text-amber-600 dark:text-amber-400">
                Started {new Date(generation.started_at).toLocaleString()}
                {' '}({Math.floor((Date.now() - new Date(generation.started_at).getTime()) / 60000)} minutes ago)
              </div>
            </div>
          )}

          {/* Full prompt */}
          {generation.final_prompt && (
            <div>
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Prompt
              </div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
                {generation.final_prompt}
              </div>
            </div>
          )}

          {/* Error message (full) */}
          {generation.error_message && (
            <div>
              <div className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">
                Error
              </div>
              <div className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">
                {generation.error_message}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Created:</span>
              <span className="ml-1 text-neutral-600 dark:text-neutral-400">
                {new Date(generation.created_at).toLocaleString()}
              </span>
            </div>
            {/* Only show started time if not already shown in Processing Duration box */}
            {generation.started_at && !isActive && (
              <div>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">Started:</span>
                <span className="ml-1 text-neutral-600 dark:text-neutral-400">
                  {new Date(generation.started_at).toLocaleString()}
                </span>
              </div>
            )}
            {generation.completed_at && (
              <div>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">Completed:</span>
                <span className="ml-1 text-neutral-600 dark:text-neutral-400">
                  {new Date(generation.completed_at).toLocaleString()}
                </span>
              </div>
            )}
            <div>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Priority:</span>
              <span className="ml-1 text-neutral-600 dark:text-neutral-400">
                {generation.priority}
              </span>
            </div>
          </div>

          {/* IDs */}
          <div className="flex gap-4 text-xs">
            <div>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Generation ID:</span>
              <span className="ml-1 text-neutral-600 dark:text-neutral-400 font-mono">
                {generation.id}
              </span>
            </div>
            {generation.asset_id && (
              <div>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">Asset ID:</span>
                <span className="ml-1 text-neutral-600 dark:text-neutral-400 font-mono">
                  {generation.asset_id}
                </span>
              </div>
            )}
          </div>

          {/* Provider/Account Debug Info */}
          {(() => {
            const accountId = generation.raw_params?.account_id || generation.raw_params?.accountId;
            const accountEmail = generation.raw_params?.account_email || generation.raw_params?.accountEmail || generation.raw_params?.email;
            const providerJobId = generation.raw_params?.provider_job_id || generation.raw_params?.providerJobId || generation.raw_params?.job_id;
            const hasAnyInfo = accountId || accountEmail || providerJobId;

            return hasAnyInfo ? (
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                  🔍 Provider Details
                </div>
                <div className="space-y-1 text-xs text-blue-600 dark:text-blue-400">
                  {accountId && (
                    <div>
                      <span className="font-medium">Account ID:</span>
                      <span className="ml-1 font-mono">{accountId}</span>
                    </div>
                  )}
                  {accountEmail && (
                    <div>
                      <span className="font-medium">Account Email:</span>
                      <span className="ml-1">{accountEmail}</span>
                    </div>
                  )}
                  {providerJobId && (
                    <div>
                      <span className="font-medium">Provider Job ID:</span>
                      <span className="ml-1 font-mono">{providerJobId}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null;
          })()}

          {/* Raw Parameters (for debugging) */}
          {generation.raw_params && Object.keys(generation.raw_params).length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Raw Parameters
              </div>
              <pre className="text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 p-2 rounded overflow-x-auto max-h-40">
                {JSON.stringify(generation.raw_params, null, 2)}
              </pre>
            </div>
          )}

          {/* Canonical Parameters */}
          {generation.canonical_params && Object.keys(generation.canonical_params).length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Canonical Parameters
              </div>
              <pre className="text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 p-2 rounded overflow-x-auto max-h-40">
                {JSON.stringify(generation.canonical_params, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
