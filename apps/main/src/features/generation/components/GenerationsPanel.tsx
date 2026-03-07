/**
 * Generations Panel
 *
 * Dedicated panel for tracking and managing generation jobs.
 * Shows status, allows filtering, grouping, and batch cancel.
 */
import { DisclosureSection, Dropdown, DropdownItem, DropdownDivider, FoldableJson, GroupByPillBar, ToolbarToggleButton, toggleInStack, clearStack } from '@pixsim7/shared.ui';
import { useMemo, useState, useCallback, useRef } from 'react';

import { patchGenerationPrompt, retryGeneration, cancelGeneration, deleteGeneration, getGeneration } from '@lib/api/generations';
import { Icons, Icon } from '@lib/icons';

import { useAsset, getAssetDisplayUrls } from '@features/assets';
import { CompactAssetCard, AssetGrid } from '@features/assets/components/shared';
import { ClientFilterBar } from '@features/gallery/components/ClientFilterBar';
import { useClientFilterPersistence } from '@features/gallery/lib/useClientFilterPersistence';
import { useClientFilters } from '@features/gallery/lib/useClientFilters';
import { getGenerationStatusDisplay } from '@features/generation/lib/core/generationAssetMapping';
import { getGenerationSessionStore } from '@features/generation/stores/generationScopeStores';
import { useGenerationSettingsStore } from '@features/generation/stores/generationSettingsStore';

import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';

import { useBatchCancelGenerations } from '../hooks/useBatchCancelGenerations';
import { useGenerationWebSocket } from '../hooks/useGenerationWebSocket';
import { useRecentGenerations } from '../hooks/useRecentGenerations';
import { GENERATION_FILTER_DEFS } from '../lib/generationFilterDefs';
import {
  groupGenerations,
  GROUP_BY_OPTIONS,
  type GenerationGroupBy,
  type GenerationGroup,
} from '../lib/generationGrouping';
import { fromGenerationResponse, getGenerationModelName, type GenerationModel } from '../models';
import { useGenerationsStore, isGenerationActive } from '../stores/generationsStore';

export interface GenerationsPanelProps {
  onOpenAsset?: (assetId: number) => void;
}

export function GenerationsPanel({ onOpenAsset }: GenerationsPanelProps) {
  const [groupByStack, setGroupByStack] = useState<GenerationGroupBy[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // WebSocket for real-time updates
  const { isConnected: wsConnected } = useGenerationWebSocket();

  // Fetch recent generations (shared hook)
  const { isLoading, refresh: handleRefresh } = useRecentGenerations({ limit: 200 });

  // Get generations Map (stable reference)
  const generationsMap = useGenerationsStore(state => state.generations);

  // Convert to array only when Map changes, filter out any with invalid ids
  const allGenerations = useMemo(
    () => Array.from(generationsMap.values()).filter(g => g && g.id != null),
    [generationsMap]
  );

  // Reusable filter system
  const persistenceOptions = useClientFilterPersistence('generations-panel-filters');
  const {
    filteredItems,
    filterState,
    visibleDefs,
    setFilter,
    resetFilters,
    derivedOptions,
  } = useClientFilters(allGenerations, GENERATION_FILTER_DEFS, persistenceOptions);

  // Sort filtered results by newest first
  const sortedGenerations = useMemo(
    () => [...filteredItems].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [filteredItems]
  );

  // Grouping
  const groups = useMemo(
    () => groupGenerations(sortedGenerations, groupByStack),
    [sortedGenerations, groupByStack]
  );

  // Batch cancel
  const { batchCancel, isCancelling: isBatchCancelling } = useBatchCancelGenerations();

  const handleBatchCancel = useCallback(async (ids: number[]) => {
    if (!confirm(`Cancel ${ids.length} active generation(s)?`)) return;
    const result = await batchCancel(ids);
    if (result.failed > 0) {
      alert(`Cancelled ${result.succeeded}, failed ${result.failed}:\n${result.errors.join('\n')}`);
    }
  }, [batchCancel]);

  const handleRetry = useCallback(async (id: number) => {
    try {
      const newGeneration = await retryGeneration(id);
      // Map at boundary and add to store
      useGenerationsStore.getState().addOrUpdate(fromGenerationResponse(newGeneration));
    } catch (error) {
      console.error('Failed to retry generation:', error);
      alert('Failed to retry generation');
    }
  }, []);

  const handleCancel = useCallback(async (id: number) => {
    try {
      const updated = await cancelGeneration(id);
      // Map at boundary and update store
      useGenerationsStore.getState().addOrUpdate(fromGenerationResponse(updated));
    } catch (error) {
      console.error('Failed to cancel generation:', error);
      alert('Failed to cancel generation');
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!id) {
      console.error('Cannot delete generation: invalid id', id);
      return;
    }
    if (!confirm('Delete this generation permanently?')) return;
    try {
      await deleteGeneration(id);
      // Remove from store
      useGenerationsStore.getState().remove(id);
    } catch (error) {
      console.error('Failed to delete generation:', error);
      alert('Failed to delete generation');
    }
  }, []);

  const handleOpenAsset = useCallback((assetId: number) => {
    onOpenAsset?.(assetId);
  }, [onOpenAsset]);

  // Load a generation's settings into Quick Generate for editing and retry
  const handleLoadToQuickGen = useCallback((generation: GenerationModel) => {
    const sessionStore = getGenerationSessionStore('global').getState();

    // Set operation type
    if (generation.operationType) {
      sessionStore.setOperationType(generation.operationType as any);
    }

    // Set provider
    if (generation.providerId) {
      sessionStore.setProvider(generation.providerId);
    }

    // Set prompt
    if (generation.finalPrompt) {
      sessionStore.setPrompt(generation.finalPrompt);
    }

    // Set params from rawParams or canonicalParams
    const params = generation.canonicalParams || generation.rawParams;
    if (params) {
      useGenerationSettingsStore.getState().setDynamicParams(params);
    }
  }, []);

  const handleReplacePrompt = useCallback(async (generations: GenerationModel[], newPrompt: string) => {
    const results = { succeeded: 0, failed: 0, errors: [] as string[] };
    for (const gen of generations) {
      try {
        const updated = await patchGenerationPrompt(gen.id, newPrompt);
        useGenerationsStore.getState().addOrUpdate(fromGenerationResponse(updated));
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push(`#${gen.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (results.failed > 0) {
      alert(`Updated ${results.succeeded}, failed ${results.failed}:\n${results.errors.join('\n')}`);
    }
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Generations</h2>
          <div className="flex items-center gap-2">
            {/* WebSocket status */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
              wsConnected
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse-subtle' : 'bg-neutral-400'}`} />
              {wsConnected ? 'Live' : 'Offline'}
            </div>
            {/* Manual refresh */}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
              title="Refresh generations"
            >
              <Icon
                name="refresh"
                size={16}
                className={`text-neutral-600 dark:text-neutral-400 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex gap-2 items-center flex-wrap">
          <ClientFilterBar
            defs={visibleDefs}
            filterState={filterState}
            derivedOptions={derivedOptions}
            onFilterChange={setFilter}
            onReset={resetFilters}
            popoverMode="inline"
          />

          {/* Group by pill bar */}
          <GroupByPillBar
            options={GROUP_BY_OPTIONS}
            selected={groupByStack}
            onToggle={(v) => setGroupByStack(prev => toggleInStack(prev, v))}
            onClear={() => setGroupByStack(clearStack())}
          />
          {groupByStack.length > 0 && (
            <ToolbarToggleButton
              active={viewMode === 'grid'}
              onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
              icon={<Icon name={viewMode === 'grid' ? 'layoutGrid' : 'rows'} size={14} />}
              title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
            />
          )}
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
        ) : sortedGenerations.length === 0 ? (
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
        ) : groups ? (
          <div className="space-y-3">
            {groups.map(group => (
              <GenerationGroupSection
                key={group.key}
                group={group}
                viewMode={viewMode}
                onRetry={handleRetry}
                onCancel={handleCancel}
                onDelete={handleDelete}
                onOpenAsset={handleOpenAsset}
                onLoadToQuickGen={handleLoadToQuickGen}
                onBatchCancel={handleBatchCancel}
                onReplacePrompt={handleReplacePrompt}
                isBatchCancelling={isBatchCancelling}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedGenerations.map(generation => (
              <GenerationItem
                key={generation.id}
                generation={generation}
                onRetry={handleRetry}
                onCancel={handleCancel}
                onDelete={handleDelete}
                onOpenAsset={handleOpenAsset}
                onLoadToQuickGen={handleLoadToQuickGen}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// GenerationGroupSection
// ============================================================================

interface GenerationGroupSectionProps {
  group: GenerationGroup;
  viewMode: 'list' | 'grid';
  depth?: number;
  onRetry: (id: number) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenAsset: (assetId: number) => void;
  onLoadToQuickGen: (generation: GenerationModel) => void;
  onBatchCancel: (ids: number[]) => void;
  onReplacePrompt: (generations: GenerationModel[], newPrompt: string) => void;
  isBatchCancelling: boolean;
}

/** Inline 28×28 asset thumbnail for group headers. */
function GroupAssetPreview({ assetId }: { assetId: number }) {
  const { asset, loading } = useAsset(assetId);
  const urls = asset ? getAssetDisplayUrls(asset) : undefined;
  const { thumbSrc, thumbLoading } = useResolvedAssetMedia({
    thumbUrl: urls?.thumbnailUrl,
    previewUrl: urls?.previewUrl,
  });

  if (!loading && !asset) return null;

  if (loading || thumbLoading) {
    return (
      <div className="w-7 h-7 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse-subtle flex-shrink-0" />
    );
  }

  if (!thumbSrc) return null;

  return (
    <img
      src={thumbSrc}
      alt=""
      className="w-7 h-7 rounded object-cover flex-shrink-0"
    />
  );
}

/** Collect all active generation IDs from a group, including nested subgroups. */
function collectActiveIds(group: { items: GenerationModel[]; subgroups?: Array<{ items: GenerationModel[]; subgroups?: any }> }): number[] {
  const ids: number[] = [];
  if (group.subgroups) {
    for (const sub of group.subgroups) ids.push(...collectActiveIds(sub));
  } else {
    for (const g of group.items) {
      if (isGenerationActive(g.status)) ids.push(g.id);
    }
  }
  return ids;
}

/** Collect generation IDs that can be retried (failed / cancelled). */
function collectRetryableIds(group: { items: GenerationModel[]; subgroups?: Array<{ items: GenerationModel[]; subgroups?: any }> }): number[] {
  const ids: number[] = [];
  if (group.subgroups) {
    for (const sub of group.subgroups) ids.push(...collectRetryableIds(sub));
  } else {
    for (const g of group.items) {
      if (g.status === 'failed' || g.status === 'cancelled') ids.push(g.id);
    }
  }
  return ids;
}

/** Collect generation IDs in a terminal state (completed / failed / cancelled). */
function collectTerminalIds(group: { items: GenerationModel[]; subgroups?: Array<{ items: GenerationModel[]; subgroups?: any }> }): number[] {
  const ids: number[] = [];
  if (group.subgroups) {
    for (const sub of group.subgroups) ids.push(...collectTerminalIds(sub));
  } else {
    for (const g of group.items) {
      if (g.status === 'completed' || g.status === 'failed' || g.status === 'cancelled') ids.push(g.id);
    }
  }
  return ids;
}

/** Grid card for a completed generation with an asset. */
function GenerationAssetGridCard({ assetId, onClick }: { assetId: number; onClick?: (assetId: number) => void }) {
  const { asset, loading } = useAsset(assetId);

  if (loading || !asset) {
    return (
      <div className="aspect-square rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse-subtle" />
    );
  }

  return (
    <CompactAssetCard
      asset={asset}
      hideFooter
      aspectSquare
      enableHoverPreview
      onClick={onClick ? () => onClick(assetId) : undefined}
    />
  );
}

/** Grid content for a leaf group — shows completed items as media cards, with a status summary for the rest. */
function GenerationGroupGridContent({
  items,
  onOpenAsset,
}: {
  items: GenerationModel[];
  onOpenAsset: (assetId: number) => void;
}) {
  const completedWithAsset = items.filter(g => g.status === 'completed' && (g.asset?.id ?? g.assetId));
  const others = items.filter(g => !(g.status === 'completed' && (g.asset?.id ?? g.assetId)));

  // Summarise non-completed items by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of others) {
      counts[g.status] = (counts[g.status] || 0) + 1;
    }
    return Object.entries(counts);
  }, [others]);

  return (
    <div className="space-y-2">
      {completedWithAsset.length > 0 && (
        <AssetGrid preset="compact" gap={2}>
          {completedWithAsset.map(g => (
            <GenerationAssetGridCard
              key={g.id}
              assetId={(g.asset?.id ?? g.assetId)!}
              onClick={onOpenAsset}
            />
          ))}
        </AssetGrid>
      )}
      {statusCounts.length > 0 && (
        <div className="text-xs text-neutral-500 dark:text-neutral-500 px-1">
          {statusCounts.map(([status, count], i) => (
            <span key={status}>
              {i > 0 && ', '}
              {count} {status}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GenerationGroupSection({
  group,
  viewMode,
  depth = 0,
  onRetry,
  onCancel,
  onDelete,
  onOpenAsset,
  onLoadToQuickGen,
  onBatchCancel,
  onReplacePrompt,
  isBatchCancelling,
}: GenerationGroupSectionProps) {
  const activeIds = useMemo(() => collectActiveIds(group), [group]);
  const retryableIds = useMemo(() => collectRetryableIds(group), [group]);
  const terminalIds = useMemo(() => collectTerminalIds(group), [group]);
  const isNested = depth > 0;
  const sectionSize = isNested ? 'sm' : 'md';
  const useBorder = isNested;

  // Three-dots menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  // Show asset thumbnail in group header when dimension is 'asset'
  const assetId = group.dimension === 'asset' && group.key !== '__no_asset__'
    ? Number(group.key)
    : null;

  const fullPrompt = group.dimension === 'prompt' ? group.items[0]?.finalPrompt : null;

  const groupLabel = (
    <span className="flex items-center gap-2">
      {assetId != null && <GroupAssetPreview assetId={assetId} />}
      <span>{group.label}</span>
      <span className="text-neutral-500 dark:text-neutral-500">
        ({group.items.length})
      </span>
      {group.activeCount > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
          {group.activeCount} active
        </span>
      )}
    </span>
  );

  const batchCancelAction = activeIds.length >= 2 ? (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onBatchCancel(activeIds);
      }}
      disabled={isBatchCancelling}
      className="px-2 py-0.5 text-[10px] font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
      title={`Cancel all ${activeIds.length} active generations`}
    >
      {isBatchCancelling ? 'Cancelling...' : `Cancel ${activeIds.length}`}
    </button>
  ) : null;

  const handleCopyPrompt = () => {
    if (fullPrompt) navigator.clipboard.writeText(fullPrompt);
    setMenuOpen(false);
  };

  const handleLoadToQuickGenGroup = () => {
    const sample = group.items[0];
    if (sample) onLoadToQuickGen(sample);
    setMenuOpen(false);
  };

  const handleRetryAllFailed = async () => {
    setMenuOpen(false);
    if (retryableIds.length === 0) return;
    if (!confirm(`Retry ${retryableIds.length} failed/cancelled generation(s)?`)) return;
    for (const id of retryableIds) onRetry(id);
  };

  const handleDeleteAllTerminal = async () => {
    setMenuOpen(false);
    if (terminalIds.length === 0) return;
    if (!confirm(`Delete ${terminalIds.length} completed/failed/cancelled generation(s)?`)) return;
    for (const id of terminalIds) onDelete(id);
  };

  const handleReplacePromptInGroup = () => {
    setMenuOpen(false);
    const currentPrompt = fullPrompt ?? group.items[0]?.finalPrompt ?? '';
    const newPrompt = window.prompt('Replace prompt for all generations in this group:', currentPrompt);
    if (newPrompt == null || newPrompt.trim() === '' || newPrompt === currentPrompt) return;
    onReplacePrompt(group.items, newPrompt.trim());
  };

  const groupActions = (
    <span className="flex items-center gap-1">
      {batchCancelAction}
      <span className="relative">
        <button
          ref={menuTriggerRef}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          title="Group actions"
        >
          <Icon name="moreVertical" size={14} className="text-neutral-500" />
        </button>
        <Dropdown
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          position="bottom-right"
          minWidth="180px"
          triggerRef={menuTriggerRef}
        >
          {fullPrompt && (
            <DropdownItem
              icon={<Icon name="clipboard" size={12} />}
              onClick={handleCopyPrompt}
            >
              Copy prompt
            </DropdownItem>
          )}
          <DropdownItem
            icon={<Icon name="edit" size={12} />}
            onClick={handleLoadToQuickGenGroup}
          >
            Load to Quick Generate
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem
            icon={<Icon name="pencil" size={12} />}
            onClick={handleReplacePromptInGroup}
          >
            Replace prompt ({group.items.length})
          </DropdownItem>
          {retryableIds.length > 0 && (
            <>
              <DropdownDivider />
              <DropdownItem
                icon={<Icon name="refreshCw" size={12} />}
                onClick={handleRetryAllFailed}
              >
                Retry failed ({retryableIds.length})
              </DropdownItem>
            </>
          )}
          {terminalIds.length > 0 && (
            <>
              <DropdownDivider />
              <DropdownItem
                variant="danger"
                icon={<Icon name="trash" size={12} />}
                onClick={handleDeleteAllTerminal}
              >
                Delete all finished ({terminalIds.length})
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </span>
    </span>
  );

  return (
    <DisclosureSection
      label={groupLabel}
      defaultOpen
      size={sectionSize}
      iconStyle="chevron"
      bordered={useBorder}
      actions={groupActions}
    >
      <div className="space-y-2 mt-1">
        {group.subgroups ? (
          group.subgroups.map(sub => (
            <GenerationGroupSection
              key={sub.key}
              group={sub}
              viewMode={viewMode}
              depth={depth + 1}
              onRetry={onRetry}
              onCancel={onCancel}
              onDelete={onDelete}
              onOpenAsset={onOpenAsset}
              onLoadToQuickGen={onLoadToQuickGen}
              onBatchCancel={onBatchCancel}
              onReplacePrompt={onReplacePrompt}
              isBatchCancelling={isBatchCancelling}
            />
          ))
        ) : viewMode === 'grid' ? (
          <GenerationGroupGridContent items={group.items} onOpenAsset={onOpenAsset} />
        ) : (
          group.items.map(generation => (
            <GenerationItem
              key={generation.id}
              generation={generation}
              onRetry={onRetry}
              onCancel={onCancel}
              onDelete={onDelete}
              onOpenAsset={onOpenAsset}
              onLoadToQuickGen={onLoadToQuickGen}
            />
          ))
        )}
      </div>
    </DisclosureSection>
  );
}

// ============================================================================
// GenerationItem
// ============================================================================

interface GenerationItemProps {
  generation: GenerationModel;
  onRetry: (id: number) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenAsset: (assetId: number) => void;
  onLoadToQuickGen: (generation: GenerationModel) => void;
}

type ParamTab = 'raw' | 'canonical' | 'submitted';

function GenerationItem({ generation, onRetry, onCancel, onDelete, onOpenAsset, onLoadToQuickGen }: GenerationItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [paramTab, setParamTab] = useState<ParamTab>('canonical');
  const statusDisplay = getGenerationStatusDisplay(generation.status);
  const isActive = isGenerationActive(generation.status);
  const isTerminal = generation.status === 'completed' || generation.status === 'failed' || generation.status === 'cancelled';
  const canRetry = generation.status === 'failed' || generation.status === 'cancelled';
  const canCancel = isActive;
  const canDelete = isTerminal;
  const activityBadge = useMemo(() => {
    const hasSubmitEvidence =
      (generation.attemptCount != null && generation.attemptCount > 0) ||
      generation.latestSubmissionPayload != null;
    const hasProviderAcceptance = Boolean(generation.latestSubmissionProviderJobId);
    if (generation.status === 'processing') {
      if (!hasSubmitEvidence) {
        return {
          label: 'STARTING',
          className:
            'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
          title: 'Starting / processing state without visible submit attempt yet',
        };
      }
      if (!hasProviderAcceptance) {
        return {
          label: 'SUBMIT',
          className:
            'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
          title: 'Submission attempt recorded; waiting for provider job acceptance',
        };
      }
      return {
        label: 'POLLING',
        className:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        title: 'Provider accepted (job ID assigned); polling for status',
      };
    }
    if (generation.status === 'pending' || generation.status === 'queued') {
      if (generation.waitReason && /yield/i.test(generation.waitReason)) {
        return {
          label: 'YIELDING',
          className:
            'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
          title: 'Yielding to newer generations on the same account',
        };
      }
      if (generation.waitReason && /concurrent|capacity|adaptive|cooldown/i.test(generation.waitReason)) {
        return {
          label: 'COOLDOWN',
          className:
            'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
          title: 'Waiting for provider concurrency slot',
        };
      }
      if (generation.retryCount > 0) {
        return {
          label: 'RETRYING',
          className:
            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
          title: 'Waiting for a retry attempt',
        };
      }
      if (hasProviderAcceptance) {
        return {
          label: 'ACCEPTED',
          className:
            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
          title: 'Latest known provider submission has a provider job ID',
        };
      }
      if (hasSubmitEvidence) {
        return {
          label: 'SUBMITTED',
          className:
            'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
          title: 'Submitted to provider previously; currently waiting',
        };
      }
      return {
        label: 'QUEUED',
        className:
          'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
        title: 'Queued / waiting to start',
      };
    }
    return null;
  }, [
    generation.status,
    generation.retryCount,
    generation.attemptCount,
    generation.latestSubmissionPayload,
    generation.latestSubmissionProviderJobId,
    generation.waitReason,
  ]);

  // Manual refresh for debugging stuck generations
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const updated = await getGeneration(generation.id);
      useGenerationsStore.getState().addOrUpdate(fromGenerationResponse(updated));
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

  // Delete with loading state
  const handleDeleteClick = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(generation.id);
    } finally {
      setIsDeleting(false);
    }
  }, [generation.id, onDelete]);

  // Truncate prompt
  const promptPreview = generation.finalPrompt
    ? generation.finalPrompt.length > 80
      ? generation.finalPrompt.substring(0, 80) + '...'
      : generation.finalPrompt
    : generation.name || 'Untitled generation';
  const modelName = getGenerationModelName(generation);

  // Format time
  const timeAgo = useMemo(() => {
    const now = Date.now();
    const created = new Date(generation.createdAt).getTime();
    const diff = now - created;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }, [generation.createdAt]);

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors">
      {/* Main row */}
      <div className="flex items-start gap-3 p-3">
        {/* Status icon */}
        <div className={`flex-shrink-0 mt-0.5 ${statusDisplay.color}`}>
          <Icon name={statusDisplay.icon} size={18} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Prompt preview */}
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate flex-1 min-w-0">
              {promptPreview}
            </p>
            {activityBadge && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${activityBadge.className}`}
                title={activityBadge.title}
              >
                {activityBadge.label}
              </span>
            )}
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 flex-wrap">
            <span className="font-medium">{generation.providerId}</span>
            <span className="text-neutral-400 dark:text-neutral-600">•</span>
            <span>{generation.operationType}</span>
            {modelName && (
              <>
                <span className="text-neutral-400 dark:text-neutral-600">&bull;</span>
                <span className="font-mono text-neutral-700 dark:text-neutral-300" title={`Model: ${modelName}`}>
                  {modelName}
                </span>
              </>
            )}
            {generation.accountEmail && (
              <>
                <span className="text-neutral-400 dark:text-neutral-600">•</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium" title={`Account: ${generation.accountEmail}`}>
                  {generation.accountEmail.split('@')[0]}
                </span>
              </>
            )}
            <span className="text-neutral-400 dark:text-neutral-600">&bull;</span>
            <span>{timeAgo}</span>
            {generation.retryCount > 0 && (
              <>
                <span className="text-neutral-400 dark:text-neutral-600">&bull;</span>
                <span className="text-amber-600 dark:text-amber-400">
                  {generation.retryCount} {generation.retryCount === 1 ? 'retry' : 'retries'}
                </span>
              </>
            )}
            {generation.attemptCount != null && generation.attemptCount > 1 && (
              <>
                <span className="text-neutral-400 dark:text-neutral-600">&bull;</span>
                <span
                  className="text-rose-600 dark:text-rose-400"
                  title="Provider submission attempts for this generation"
                >
                  {generation.attemptCount} attempts
                </span>
              </>
            )}
          </div>

          {/* Error message (when collapsed) - only show for failed status */}
          {!isExpanded && generation.status === 'failed' && generation.errorMessage && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate">
              {generation.errorMessage}
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
            <Icon
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
            <Icon
              name="refresh"
              size={14}
              className={`text-neutral-600 dark:text-neutral-400 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>

          {(() => {
            const assetId = generation.asset?.id ?? generation.assetId;
            if (!assetId) return null;
            return (
              <button
                onClick={() => onOpenAsset(assetId)}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                title="Open asset"
              >
                <Icon name="externalLink" size={14} className="text-neutral-600 dark:text-neutral-400" />
              </button>
            );
          })()}
          {canRetry && (
            <>
              <button
                onClick={handleRetryClick}
                disabled={isRetrying}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
                title="Retry generation"
              >
                <Icon
                  name="refreshCw"
                  size={14}
                  className={`text-blue-600 dark:text-blue-400 ${isRetrying ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                onClick={() => onLoadToQuickGen(generation)}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                title="Load to Quick Generate (edit prompt and retry)"
              >
                <Icon
                  name="edit"
                  size={14}
                  className="text-amber-600 dark:text-amber-400"
                />
              </button>
            </>
          )}
          {canCancel && (
            <button
              onClick={handleCancelClick}
              disabled={isCancelling}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
              title="Cancel generation"
            >
              <Icon
                name="x"
                size={14}
                className={`text-red-600 dark:text-red-400 ${isCancelling ? 'opacity-50' : ''}`}
              />
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDeleteClick}
              disabled={isDeleting}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
              title="Delete generation"
            >
              <Icon
                name="trash"
                size={14}
                className={`text-neutral-500 dark:text-neutral-500 ${isDeleting ? 'opacity-50' : ''}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-950/50 space-y-3">
          {/* Debug info for stuck generations */}
          {isActive && generation.startedAt && (
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
              <div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
                ⏱️ Processing Duration
              </div>
              <div className="text-xs text-amber-600 dark:text-amber-400">
                Started {new Date(generation.startedAt).toLocaleString()}
                {' '}({Math.floor((Date.now() - new Date(generation.startedAt).getTime()) / 60000)} minutes ago)
              </div>
            </div>
          )}

          {/* Full prompt - collapsible for long prompts */}
          {generation.finalPrompt && (
            <DisclosureSection
              label={`Prompt (${generation.finalPrompt.length} chars)`}
              defaultOpen={generation.finalPrompt.length < 200}
              size="sm"
              iconStyle="chevron"
            >
              <div className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
                {generation.finalPrompt}
              </div>
            </DisclosureSection>
          )}

          {/* Error message (full) - only show for failed status */}
          {generation.status === 'failed' && generation.errorMessage && (
            <div>
              <div className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">
                Error
              </div>
              <div className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">
                {generation.errorMessage}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Created:</span>
              <span className="ml-1 text-neutral-600 dark:text-neutral-400">
                {new Date(generation.createdAt).toLocaleString()}
              </span>
            </div>
            {/* Only show started time if not already shown in Processing Duration box */}
            {generation.startedAt && !isActive && (
              <div>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">Started:</span>
                <span className="ml-1 text-neutral-600 dark:text-neutral-400">
                  {new Date(generation.startedAt).toLocaleString()}
                </span>
              </div>
            )}
            {generation.completedAt && (
              <div>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">Completed:</span>
                <span className="ml-1 text-neutral-600 dark:text-neutral-400">
                  {new Date(generation.completedAt).toLocaleString()}
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
            {(() => {
              const assetId = generation.asset?.id ?? generation.assetId;
              if (!assetId) return null;
              return (
                <div>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">Asset ID:</span>
                  <span className="ml-1 text-neutral-600 dark:text-neutral-400 font-mono">
                    {assetId}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Provider/Account Debug Info */}
          {(() => {
            const rawParams = generation.rawParams as Record<string, any> | undefined;
            const accountId = rawParams?.account_id || rawParams?.accountId;
            const accountEmail = rawParams?.account_email || rawParams?.accountEmail || rawParams?.email;
            const providerJobId = rawParams?.provider_job_id || rawParams?.providerJobId || rawParams?.job_id;
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

          {/* Parameters with tabs - collapsible */}
          {(() => {
            const hasRaw = generation.rawParams && Object.keys(generation.rawParams).length > 0;
            const hasCanonical = generation.canonicalParams && Object.keys(generation.canonicalParams).length > 0;
            const hasSubmitted =
              generation.latestSubmissionPayload &&
              Object.keys(generation.latestSubmissionPayload).length > 0;
            if (!hasRaw && !hasCanonical && !hasSubmitted) return null;

            const tabs: Array<{ id: ParamTab; label: string; data: Record<string, unknown> }> = [];
            if (hasCanonical) {
              tabs.push({ id: 'canonical', label: 'Canonical', data: generation.canonicalParams });
            }
            if (hasRaw) {
              tabs.push({ id: 'raw', label: 'Raw', data: generation.rawParams });
            }
            if (hasSubmitted) {
              tabs.push({
                id: 'submitted',
                label: 'Sent to Provider',
                data: generation.latestSubmissionPayload as Record<string, unknown>,
              });
            }

            const activeTab = tabs.find(tab => tab.id === paramTab)?.id ?? tabs[0].id;
            const activeData = tabs.find(tab => tab.id === activeTab)?.data ?? tabs[0].data;

            const paramContent = (() => {
              // If only one exists, show it directly without tabs
              if (tabs.length === 1) {
                return (
                  <div className="bg-neutral-100 dark:bg-neutral-900 p-2 rounded max-h-64 overflow-y-auto">
                    <FoldableJson data={tabs[0].data} defaultExpandDepth={1} compact />
                  </div>
                );
              }

              // Multiple sources exist - show tabbed interface
              return (
                <>
                  <div className="flex gap-0.5 bg-neutral-200 dark:bg-neutral-800 p-0.5 rounded w-fit mb-1">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setParamTab(tab.id)}
                        className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                          activeTab === tab.id
                            ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="bg-neutral-100 dark:bg-neutral-900 p-2 rounded max-h-64 overflow-y-auto">
                    <FoldableJson
                      data={activeData}
                      defaultExpandDepth={1}
                      compact
                    />
                  </div>
                </>
              );
            })();

            const paramLabel =
              tabs.length > 1 ? 'Parameters' : `${tabs[0].label} Parameters`;

            return (
              <DisclosureSection
                label={paramLabel}
                defaultOpen={false}
                size="sm"
                iconStyle="chevron"
              >
                {paramContent}
              </DisclosureSection>
            );
          })()}
        </div>
      )}
    </div>
  );
}
