/**
 * Generations Panel
 *
 * Dedicated panel for tracking and managing generation jobs.
 * Shows status, allows filtering, grouping, and batch cancel.
 */
import { DisclosureSection, Dropdown, DropdownItem, DropdownDivider, FoldableJson, ToolbarToggleButton, ConfirmModal, PromptModal, useToast } from '@pixsim7/shared.ui';
import { useMemo, useState, useCallback, useRef } from 'react';

import { patchGenerationPrompt, retryGeneration, cancelGeneration, pauseGeneration, resumeGeneration, deleteGeneration, getGeneration } from '@lib/api/generations';
import { Icons, Icon } from '@lib/icons';

import { useAsset, getAssetDisplayUrls } from '@features/assets';
import { AssetGrid } from '@features/assets/components/shared';
import { ClientFilterBar } from '@features/gallery/components/ClientFilterBar';
import { useClientFilterPersistence } from '@features/gallery/lib/useClientFilterPersistence';
import { useClientFilters } from '@features/gallery/lib/useClientFilters';
import { getGenerationStatusDisplay } from '@features/generation/lib/core/generationAssetMapping';
import { getGenerationSessionStore } from '@features/generation/stores/generationScopeStores';
import { useGenerationSettingsStore } from '@features/generation/stores/generationSettingsStore';

import { MediaCard } from '@/components/media/MediaCard';
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
import { fromGenerationResponse, getGenerationModelName, resolveGranularStatus, getGranularStatusLabel, type GenerationModel } from '../models';
import { useGenerationsStore, isGenerationActive } from '../stores/generationsStore';

export interface GenerationsPanelProps {
  onOpenAsset?: (assetId: number) => void;
}

const GROUPING_STORAGE_KEY = 'generations-panel-grouping';
const VIEW_MODE_STORAGE_KEY = 'generations-panel-view-mode';
const VALID_GROUP_VALUES: GenerationGroupBy[] = ['prompt', 'operation', 'provider', 'model', 'account', 'asset'];

function readStoredGroupByStack(): GenerationGroupBy[] {
  try {
    const raw = localStorage.getItem(GROUPING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v: unknown) => VALID_GROUP_VALUES.includes(v as GenerationGroupBy));
  } catch { return []; }
}

function writeStoredGroupByStack(stack: GenerationGroupBy[]): void {
  try { localStorage.setItem(GROUPING_STORAGE_KEY, JSON.stringify(stack)); } catch { /* ignore */ }
}

function readStoredViewMode(): 'list' | 'grid' {
  try {
    const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return raw === 'grid' ? 'grid' : 'list';
  } catch { return 'list'; }
}

/** Multi-check dropdown for selecting grouping dimensions. */
function GroupByDropdown({
  selected,
  onToggle,
  onClear,
}: {
  selected: GenerationGroupBy[];
  onToggle: (value: GenerationGroupBy) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const label = selected.length === 0
    ? 'Group: None'
    : selected.length === 1
      ? `Group: ${GROUP_BY_OPTIONS.find(o => o.value === selected[0])?.label ?? selected[0]}`
      : `Group: ${selected.length} selected`;

  return (
    <span className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2 py-1.5 text-xs border rounded transition-colors ${
          selected.length > 0
            ? 'bg-accent/10 border-accent text-accent dark:text-accent'
            : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:border-accent-muted'
        }`}
      >
        <Icon name="layers" size={12} />
        <span>{label}</span>
        <Icon name="chevronDown" size={10} className="opacity-50" />
      </button>
      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        position="bottom-left"
        minWidth="160px"
        triggerRef={triggerRef}
      >
        {GROUP_BY_OPTIONS.map((opt) => {
          const isChecked = selected.includes(opt.value);
          const index = selected.indexOf(opt.value);
          return (
            <DropdownItem
              key={opt.value}
              icon={
                <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] font-bold ${
                  isChecked
                    ? 'bg-accent border-accent text-accent-text'
                    : 'border-neutral-400 dark:border-neutral-500'
                }`}>
                  {isChecked && (selected.length > 1 ? index + 1 : '\u2713')}
                </span>
              }
              onClick={() => onToggle(opt.value)}
            >
              {opt.label}
            </DropdownItem>
          );
        })}
        {selected.length > 0 && (
          <>
            <DropdownDivider />
            <DropdownItem onClick={onClear}>
              Clear all
            </DropdownItem>
          </>
        )}
      </Dropdown>
    </span>
  );
}

export function GenerationsPanel({ onOpenAsset }: GenerationsPanelProps) {
  const [groupByStack, setGroupByStackRaw] = useState<GenerationGroupBy[]>(readStoredGroupByStack);
  const [viewMode, setViewModeRaw] = useState<'list' | 'grid'>(readStoredViewMode);

  const toggleGroupBy = useCallback((value: GenerationGroupBy) => {
    setGroupByStackRaw(prev => {
      const next = prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value];
      writeStoredGroupByStack(next);
      return next;
    });
  }, []);

  const clearGroupBy = useCallback(() => {
    setGroupByStackRaw([]);
    writeStoredGroupByStack([]);
  }, []);

  const setViewMode = useCallback((value: 'list' | 'grid') => {
    setViewModeRaw(value);
    try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, value); } catch { /* ignore */ }
  }, []);

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
  const toast = useToast();

  // ---- Modal state for confirm / prompt dialogs ----
  const [confirmState, setConfirmState] = useState<{
    message: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  const [promptReplaceState, setPromptReplaceState] = useState<{
    items: GenerationModel[];
    defaultValue: string;
  } | null>(null);

  const requestConfirm = useCallback(
    (message: string, onConfirm: () => void, variant?: 'danger' | 'primary') => {
      setConfirmState({ message, onConfirm, variant });
    },
    [],
  );

  const handleBatchCancel = useCallback(async (ids: number[]) => {
    requestConfirm(`Cancel ${ids.length} active generation(s)?`, async () => {
      const result = await batchCancel(ids);
      if (result.failed > 0) {
        toast.error(`Cancelled ${result.succeeded}, failed ${result.failed}: ${result.errors.join(', ')}`);
      } else {
        toast.success(`Cancelled ${result.succeeded} generation(s)`);
      }
    });
  }, [batchCancel, requestConfirm, toast]);

  const handleRetry = useCallback(async (id: number) => {
    try {
      const newGeneration = await retryGeneration(id);
      useGenerationsStore.getState().addOrUpdate(fromGenerationResponse(newGeneration));
      toast.success('Generation retried');
    } catch (error) {
      console.error('Failed to retry generation:', error);
      toast.error('Failed to retry generation');
    }
  }, [toast]);

  const handleCancel = useCallback(async (id: number) => {
    try {
      const updated = await cancelGeneration(id);
      useGenerationsStore.getState().addOrUpdate(fromGenerationResponse(updated));
    } catch (error) {
      console.error('Failed to cancel generation:', error);
      toast.error('Failed to cancel generation');
    }
  }, [toast]);

  const handlePause = useCallback(async (id: number) => {
    try {
      const updated = await pauseGeneration(id);
      useGenerationsStore.getState().addOrUpdate(fromGenerationResponse(updated));
    } catch (error) {
      console.error('Failed to pause generation:', error);
      toast.error('Failed to pause generation');
    }
  }, [toast]);

  const handleResume = useCallback(async (id: number) => {
    try {
      const updated = await resumeGeneration(id);
      useGenerationsStore.getState().addOrUpdate(fromGenerationResponse(updated));
    } catch (error) {
      console.error('Failed to resume generation:', error);
      toast.error('Failed to resume generation');
    }
  }, [toast]);

  const handleDelete = useCallback(async (id: number) => {
    if (!id) {
      console.error('Cannot delete generation: invalid id', id);
      return;
    }
    requestConfirm('Delete this generation permanently?', async () => {
      try {
        await deleteGeneration(id);
        useGenerationsStore.getState().remove(id);
      } catch (error) {
        console.error('Failed to delete generation:', error);
        toast.error('Failed to delete generation');
      }
    }, 'danger');
  }, [requestConfirm, toast]);

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

    // Set params from canonicalParams (rawParams fallback removed).
    const params = generation.canonicalParams;
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
      toast.error(`Updated ${results.succeeded}, failed ${results.failed}: ${results.errors.join(', ')}`);
    } else {
      toast.success(`Prompt replaced for ${results.succeeded} generation(s)`);
    }
  }, [toast]);

  /** Called from group sections to open the prompt-replace modal */
  const handleRequestPromptReplace = useCallback((items: GenerationModel[], defaultValue: string) => {
    setPromptReplaceState({ items, defaultValue });
  }, []);

  /** Click a status label → toggle that granular status in the filter. */
  const handleStatusClick = useCallback((status: string) => {
    const current = filterState.status as string[] | undefined;
    if (current?.includes(status)) {
      // Already filtering by this status — remove it
      const next = current.filter(s => s !== status);
      setFilter('status', next.length > 0 ? next : undefined);
    } else {
      // Add this status to the filter (or start a new selection)
      setFilter('status', [...(current ?? []), status]);
    }
  }, [filterState.status, setFilter]);

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

          {/* Group by multi-select dropdown */}
          <GroupByDropdown
            selected={groupByStack}
            onToggle={toggleGroupBy}
            onClear={clearGroupBy}
          />
          {groupByStack.length > 0 && (
            <ToolbarToggleButton
              active={viewMode === 'grid'}
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
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
                onPause={handlePause}
                onResume={handleResume}
                onDelete={handleDelete}
                onOpenAsset={handleOpenAsset}
                onLoadToQuickGen={handleLoadToQuickGen}
                onBatchCancel={handleBatchCancel}
                onReplacePrompt={handleReplacePrompt}
                onRequestConfirm={requestConfirm}
                onRequestPromptReplace={handleRequestPromptReplace}
                onStatusClick={handleStatusClick}
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
                onPause={handlePause}
                onResume={handleResume}
                onDelete={handleDelete}
                onOpenAsset={handleOpenAsset}
                onLoadToQuickGen={handleLoadToQuickGen}
                onStatusClick={handleStatusClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={confirmState != null}
        message={confirmState?.message ?? ''}
        variant={confirmState?.variant}
        onConfirm={() => {
          confirmState?.onConfirm();
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />

      {/* Prompt replace modal */}
      <PromptModal
        isOpen={promptReplaceState != null}
        title="Replace Prompt"
        message={`Replace prompt for ${promptReplaceState?.items.length ?? 0} generation(s):`}
        defaultValue={promptReplaceState?.defaultValue ?? ''}
        confirmText="Replace"
        multiline
        rows={6}
        onConfirm={(value) => {
          const trimmed = value.trim();
          if (promptReplaceState && trimmed && trimmed !== promptReplaceState.defaultValue) {
            handleReplacePrompt(promptReplaceState.items, trimmed);
          }
          setPromptReplaceState(null);
        }}
        onCancel={() => setPromptReplaceState(null)}
      />
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
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenAsset: (assetId: number) => void;
  onLoadToQuickGen: (generation: GenerationModel) => void;
  onBatchCancel: (ids: number[]) => void;
  onReplacePrompt: (generations: GenerationModel[], newPrompt: string) => void;
  onRequestConfirm: (message: string, onConfirm: () => void, variant?: 'danger' | 'primary') => void;
  onRequestPromptReplace: (items: GenerationModel[], defaultValue: string) => void;
  onStatusClick?: (status: string) => void;
  isBatchCancelling: boolean;
}

/** Inline asset thumbnail for group headers. */
function GroupAssetPreview({ assetId, size = 'sm' }: { assetId: number; size?: 'sm' | 'md' }) {
  const { asset, loading } = useAsset(assetId);
  const urls = asset ? getAssetDisplayUrls(asset) : undefined;
  const { thumbSrc, thumbLoading } = useResolvedAssetMedia({
    thumbUrl: urls?.thumbnailUrl,
    previewUrl: urls?.previewUrl,
  });

  const sizeClass = size === 'md' ? 'w-12 h-12 rounded-md' : 'w-7 h-7 rounded';

  if (!loading && !asset) return null;

  if (loading || thumbLoading) {
    return (
      <div className={`${sizeClass} bg-neutral-200 dark:bg-neutral-700 animate-pulse-subtle flex-shrink-0`} />
    );
  }

  if (!thumbSrc) return null;

  return (
    <img
      src={thumbSrc}
      alt=""
      className={`${sizeClass} object-cover flex-shrink-0`}
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
    <MediaCard
      asset={asset}
      layout={{
        density: 'compact',
        hideFooter: true,
        aspectSquare: true,
        onClick: onClick ? () => onClick(assetId) : undefined,
      }}
    />
  );
}

/** Compact grid card for a generation in any status (non-completed or without asset). */
function GenerationStatusGridCard({
  generation,
  onStatusClick,
}: {
  generation: GenerationModel;
  onStatusClick?: (status: string) => void;
}) {
  const statusDisplay = getGenerationStatusDisplay(generation.status);
  const isActive = isGenerationActive(generation.status);
  const granularStatus = resolveGranularStatus(generation);
  const granularLabel = getGranularStatusLabel(granularStatus);
  const modelName = getGenerationModelName(generation);
  const promptSnippet = generation.finalPrompt
    ? generation.finalPrompt.length > 40
      ? generation.finalPrompt.substring(0, 40) + '...'
      : generation.finalPrompt
    : generation.name || 'Untitled';

  return (
    <div className="aspect-square rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
      <div className={`${statusDisplay.color}`}>
        <Icon name={statusDisplay.icon} size={20} className={isActive ? 'animate-pulse-subtle' : ''} />
      </div>
      <button
        type="button"
        onClick={onStatusClick ? (e) => { e.stopPropagation(); onStatusClick(granularStatus); } : undefined}
        className={`text-[10px] font-semibold uppercase tracking-wide ${
          onStatusClick
            ? 'text-accent hover:underline cursor-pointer'
            : 'text-neutral-500 dark:text-neutral-400 cursor-default'
        }`}
        title={onStatusClick ? `Filter by "${granularLabel}"` : undefined}
      >
        {granularLabel}
      </button>
      <p className="text-[10px] text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-tight">
        {promptSnippet}
      </p>
      {modelName && (
        <span className="text-[9px] font-mono text-neutral-400 dark:text-neutral-500 truncate max-w-full">
          {modelName}
        </span>
      )}
    </div>
  );
}

/** Grid content for a leaf group — shows all items as cards in a grid. */
function GenerationGroupGridContent({
  items,
  dimension,
  onOpenAsset,
  onStatusClick,
}: {
  items: GenerationModel[];
  dimension?: GenerationGroupBy;
  onOpenAsset: (assetId: number) => void;
  onStatusClick?: (status: string) => void;
}) {
  const isAssetGroup = dimension === 'asset';

  return (
    <AssetGrid preset={isAssetGroup ? 'review' : 'compact'} gap={isAssetGroup ? 4 : 2}>
      {items.map(g => {
        const assetId = g.status === 'completed' ? (g.asset?.id ?? g.assetId) : null;
        return assetId ? (
          <GenerationAssetGridCard key={g.id} assetId={assetId} onClick={onOpenAsset} />
        ) : (
          <GenerationStatusGridCard key={g.id} generation={g} onStatusClick={onStatusClick} />
        );
      })}
    </AssetGrid>
  );
}

function GenerationGroupSection({
  group,
  viewMode,
  depth = 0,
  onRetry,
  onCancel,
  onPause,
  onResume,
  onDelete,
  onOpenAsset,
  onLoadToQuickGen,
  onBatchCancel,
  onReplacePrompt,
  onRequestConfirm,
  onRequestPromptReplace,
  onStatusClick,
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

  // For asset groups, compute per-status counts for header badges
  const statusBadges = useMemo(() => {
    if (group.dimension !== 'asset') return null;
    const counts: Record<string, number> = {};
    for (const g of group.items) counts[g.status] = (counts[g.status] || 0) + 1;
    return counts;
  }, [group.dimension, group.items]);

  const groupLabel = (
    <span className="flex items-center gap-2">
      {assetId != null && <GroupAssetPreview assetId={assetId} size="md" />}
      <span>{group.label}</span>
      <span className="text-neutral-500 dark:text-neutral-500">
        ({group.items.length})
      </span>
      {group.activeCount > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
          {group.activeCount} active
        </span>
      )}
      {statusBadges && (
        <span className="flex items-center gap-1">
          {(statusBadges.completed ?? 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              {statusBadges.completed} done
            </span>
          )}
          {(statusBadges.paused ?? 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              {statusBadges.paused} paused
            </span>
          )}
          {(statusBadges.failed ?? 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
              {statusBadges.failed} failed
            </span>
          )}
        </span>
      )}
    </span>
  );

  const pausableIds = useMemo(() => group.items.filter(g => g.status === 'pending' || (g.status === 'processing' && !g.deferredAction)).map(g => g.id), [group.items]);
  const pausedIds = useMemo(() => group.items.filter(g => g.status === 'paused').map(g => g.id), [group.items]);

  const batchCancelAction = activeIds.length >= 2 ? (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onBatchCancel(activeIds);
      }}
      disabled={isBatchCancelling}
      className="p-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
      title={`Cancel all ${activeIds.length} active generations`}
    >
      <Icon name="x" size={12} />
    </button>
  ) : null;

  const batchPauseAction = pausableIds.length >= 2 ? (
    <button
      onClick={(e) => {
        e.stopPropagation();
        for (const id of pausableIds) onPause(id);
      }}
      className="p-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
      title={`Pause ${pausableIds.length} pending generations`}
    >
      <Icon name="pause" size={12} />
    </button>
  ) : null;

  const batchResumeAction = pausedIds.length >= 1 ? (
    <button
      onClick={(e) => {
        e.stopPropagation();
        for (const id of pausedIds) onResume(id);
      }}
      className="p-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
      title={`Resume ${pausedIds.length} paused generation(s)`}
    >
      <Icon name="play" size={12} />
    </button>
  ) : null;

  const handleCopyPrompt = () => {
    if (fullPrompt) navigator.clipboard.writeText(fullPrompt);
    setMenuOpen(false);
  };

  const handleRetryAllFailed = () => {
    setMenuOpen(false);
    if (retryableIds.length === 0) return;
    onRequestConfirm(`Retry ${retryableIds.length} failed/cancelled generation(s)?`, () => {
      for (const id of retryableIds) onRetry(id);
    });
  };

  const handleDeleteAllTerminal = () => {
    setMenuOpen(false);
    if (terminalIds.length === 0) return;
    onRequestConfirm(`Delete ${terminalIds.length} completed/failed/cancelled generation(s)?`, () => {
      for (const id of terminalIds) onDelete(id);
    }, 'danger');
  };

  const handleReplacePromptInGroup = () => {
    setMenuOpen(false);
    const currentPrompt = fullPrompt ?? group.items[0]?.finalPrompt ?? '';
    onRequestPromptReplace(group.items, currentPrompt);
  };

  const groupActions = (
    <span className="flex items-center gap-1">
      {batchPauseAction}
      {batchResumeAction}
      {batchCancelAction}
      <span className="relative" onMouseLeave={() => setMenuOpen(false)}>
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
              onPause={onPause}
              onResume={onResume}
              onDelete={onDelete}
              onOpenAsset={onOpenAsset}
              onLoadToQuickGen={onLoadToQuickGen}
              onBatchCancel={onBatchCancel}
              onReplacePrompt={onReplacePrompt}
              onRequestConfirm={onRequestConfirm}
              onRequestPromptReplace={onRequestPromptReplace}
              onStatusClick={onStatusClick}
              isBatchCancelling={isBatchCancelling}
            />
          ))
        ) : viewMode === 'grid' ? (
          <GenerationGroupGridContent items={group.items} dimension={group.dimension} onOpenAsset={onOpenAsset} onStatusClick={onStatusClick} />
        ) : (
          group.items.map(generation => (
            <GenerationItem
              key={generation.id}
              generation={generation}
              onRetry={onRetry}
              onCancel={onCancel}
              onPause={onPause}
              onResume={onResume}
              onDelete={onDelete}
              onOpenAsset={onOpenAsset}
              onLoadToQuickGen={onLoadToQuickGen}
              onStatusClick={onStatusClick}
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
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenAsset: (assetId: number) => void;
  onLoadToQuickGen: (generation: GenerationModel) => void;
  onStatusClick?: (status: string) => void;
}

type ParamTab = 'raw' | 'canonical' | 'submitted';

function GenerationItem({ generation, onRetry, onCancel, onPause, onResume, onDelete, onOpenAsset, onLoadToQuickGen, onStatusClick }: GenerationItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [paramTab, setParamTab] = useState<ParamTab>('canonical');
  const statusDisplay = getGenerationStatusDisplay(generation.status);
  const isActive = isGenerationActive(generation.status);
  const granularStatus = resolveGranularStatus(generation);
  const isTerminal = generation.status === 'completed' || generation.status === 'failed' || generation.status === 'cancelled';
  const isPaused = generation.status === 'paused';
  const canRetry = generation.status === 'failed' || generation.status === 'cancelled';
  const canCancel = isActive && generation.deferredAction !== 'cancel';
  const canPause = generation.status === 'pending' || (generation.status === 'processing' && !generation.deferredAction);
  const canResume = isPaused;
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

  // Pause with loading state
  const handlePauseClick = useCallback(async () => {
    setIsPausing(true);
    try {
      await onPause(generation.id);
    } finally {
      setIsPausing(false);
    }
  }, [generation.id, onPause]);

  // Resume with loading state
  const handleResumeClick = useCallback(async () => {
    setIsResuming(true);
    try {
      await onResume(generation.id);
    } finally {
      setIsResuming(false);
    }
  }, [generation.id, onResume]);

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
        <button
          type="button"
          onClick={onStatusClick ? () => onStatusClick(granularStatus) : undefined}
          className={`flex-shrink-0 mt-0.5 ${statusDisplay.color} ${onStatusClick ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
          title={onStatusClick ? `Filter by "${getGranularStatusLabel(granularStatus)}"` : statusDisplay.label}
        >
          <Icon name={statusDisplay.icon} size={18} />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Prompt preview */}
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate flex-1 min-w-0">
              {promptPreview}
            </p>
            {activityBadge && (
              <button
                type="button"
                onClick={onStatusClick ? () => onStatusClick(granularStatus) : undefined}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${activityBadge.className} ${onStatusClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                title={onStatusClick ? `Filter by "${activityBadge.label}"` : activityBadge.title}
              >
                {activityBadge.label}
              </button>
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
                <span
                  className="text-amber-600 dark:text-amber-400"
                  title={generation.attemptCount != null && generation.attemptCount > 1
                    ? `${generation.attemptCount} provider submission attempts`
                    : undefined}
                >
                  {generation.retryCount} {generation.retryCount === 1 ? 'retry' : 'retries'}
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
          {canPause && (
            <button
              onClick={handlePauseClick}
              disabled={isPausing}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
              title={generation.status === 'processing' ? 'Pause after current attempt' : 'Pause generation'}
            >
              <Icon
                name="pause"
                size={14}
                className={`text-amber-600 dark:text-amber-400 ${isPausing ? 'opacity-50' : ''}`}
              />
            </button>
          )}
          {generation.deferredAction === 'pause' && (
            <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" title="Will pause after current attempt">
              pausing
            </span>
          )}
          {generation.deferredAction === 'cancel' && (
            <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" title="Will cancel after current attempt">
              cancelling
            </span>
          )}
          {canResume && (
            <button
              onClick={handleResumeClick}
              disabled={isResuming}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
              title="Resume generation"
            >
              <Icon
                name="play"
                size={14}
                className={`text-green-600 dark:text-green-400 ${isResuming ? 'opacity-50' : ''}`}
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
            // Account + provider-job fields come from the first-class response
            // fields, not the legacy rawParams blob.
            const accountId = generation.account?.id;
            const accountEmail = generation.accountEmail;
            const providerJobId = generation.latestSubmissionProviderJobId;
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
            const hasCanonical = generation.canonicalParams && Object.keys(generation.canonicalParams).length > 0;
            const hasSubmitted =
              generation.latestSubmissionPayload &&
              Object.keys(generation.latestSubmissionPayload).length > 0;
            if (!hasCanonical && !hasSubmitted) return null;

            const tabs: Array<{ id: ParamTab; label: string; data: Record<string, unknown> }> = [];
            if (hasCanonical) {
              tabs.push({ id: 'canonical', label: 'Canonical', data: generation.canonicalParams });
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
