/**
 * GenerationPresetsPanel
 *
 * Left/right split panel for browsing, inspecting, and quick-firing
 * saved generation presets.
 *
 * Left sidebar: collapsible, resizable preset list with operation filter.
 * Right body: detail view with asset thumbnails, prompt preview, and
 *   "Load" / "Load & Generate" actions.
 */

import {
  Button,
  EmptyState,
  FilterPillGroup,
  PanelShell,
  SidebarPaneShell,
  type FilterPillOption,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import { getAsset, fromAssetResponse, getAssetDisplayUrls } from '@features/assets';
import { useGenerationPresets } from '@features/generation/hooks/useGenerationPresets';
import type { GenerationPreset } from '@features/generation/stores/generationPresetStore';
import { useQuickGenerateController } from '@features/prompts';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

// ── Tiny asset thumbnail (fetches on mount) ────────────────────────────────

function PresetAssetThumb({ assetId }: { assetId: number }) {
  const [src, setSrc] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAsset(assetId)
      .then((resp) => {
        if (cancelled) return;
        const model = fromAssetResponse(resp);
        const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(model);
        setSrc(thumbnailUrl ?? previewUrl ?? mainUrl ?? undefined);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [assetId]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-800 text-neutral-400">
        <Icon name="alertCircle" size={14} />
      </div>
    );
  }
  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
        <div className="w-4 h-4 border-2 border-neutral-300 dark:border-neutral-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return <img src={src} alt={`Asset ${assetId}`} className="w-full h-full object-cover" loading="lazy" />;
}

// ── Preset row in sidebar ──────────────────────────────────────────────────

function PresetRow({
  preset,
  selected,
  onSelect,
  onDelete,
}: {
  preset: GenerationPreset;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const meta = OPERATION_METADATA[preset.operationType];
  const inputCount = preset.inputs.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className={`group relative flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
        selected
          ? 'bg-accent/15 text-accent'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      {/* Tiny leading thumbnails (max 2) */}
      <div className="flex -space-x-1.5 shrink-0">
        {preset.inputs.slice(0, 2).map((ref) => (
          <div
            key={ref.assetId}
            className="w-6 h-6 rounded overflow-hidden border border-neutral-300 dark:border-neutral-700"
          >
            <PresetAssetThumb assetId={ref.assetId} />
          </div>
        ))}
        {inputCount === 0 && (
          <div className="w-6 h-6 rounded bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
            <Icon name="image" size={10} className="text-neutral-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium truncate">{preset.name}</div>
        <div className="text-[9px] text-neutral-500 dark:text-neutral-400 truncate">
          {meta?.label ?? preset.operationType}
          {preset.providerId && (
            <span className="ml-1 opacity-60">@ {preset.providerId}</span>
          )}
          {inputCount > 0 && (
            <span className="ml-1">&middot; {inputCount} asset{inputCount > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Delete button (hover) */}
      {onDelete && !preset.isDefault && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-500 transition-opacity"
          title="Delete preset"
        >
          <Icon name="trash" size={11} />
        </button>
      )}
    </div>
  );
}

// ── Detail pane (right side) ───────────────────────────────────────────────

function PresetDetail({
  preset,
  onLoad,
  onLoadAndGenerate,
  loading,
}: {
  preset: GenerationPreset;
  onLoad: () => void;
  onLoadAndGenerate: () => void;
  loading: boolean;
}) {
  const meta = OPERATION_METADATA[preset.operationType];
  const hasInputs = preset.inputs.length > 0;
  const paramKeys = Object.keys(preset.params).filter(
    (k) => preset.params[k] !== undefined && preset.params[k] !== null && preset.params[k] !== '',
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{preset.name}</div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {meta?.label}
            {preset.providerId && <span className="ml-1 opacity-70">@ {preset.providerId}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="secondary" size="xs" onClick={onLoad} disabled={loading}>
            Load
          </Button>
          <Button size="xs" onClick={onLoadAndGenerate} loading={loading} className="gap-1">
            <Icon name="play" size={10} />
            Go
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Prompt */}
        {preset.prompt && (
          <section>
            <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
              Prompt
            </div>
            <div className="text-[11px] text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800 rounded-md p-2 whitespace-pre-wrap line-clamp-4">
              {preset.prompt}
            </div>
          </section>
        )}

        {/* Assets grid */}
        {hasInputs && (
          <section>
            <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
              Assets ({preset.inputs.length})
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {preset.inputs.map((ref, idx) => (
                <div
                  key={`${ref.assetId}-${idx}`}
                  className="aspect-square rounded-md overflow-hidden border border-neutral-200 dark:border-neutral-700"
                >
                  <PresetAssetThumb assetId={ref.assetId} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Params summary */}
        {paramKeys.length > 0 && (
          <section>
            <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
              Parameters
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {paramKeys.map((key) => (
                <div key={key} className="flex items-baseline gap-1 text-[10px]">
                  <span className="text-neutral-500 dark:text-neutral-400 truncate">{key}</span>
                  <span className="text-neutral-700 dark:text-neutral-300 font-medium truncate">
                    {String(preset.params[key])}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Timestamps */}
        <div className="text-[9px] text-neutral-400 dark:text-neutral-500 pt-1 border-t border-neutral-100 dark:border-neutral-800">
          Created {new Date(preset.createdAt).toLocaleDateString()}
          {preset.updatedAt !== preset.createdAt && (
            <span> &middot; Updated {new Date(preset.updatedAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function GenerationPresetsPanel() {
  const {
    allPresets,
    loading: presetLoading,
    loadPresetAsync,
    deletePreset,
  } = useGenerationPresets();
  const controller = useQuickGenerateController();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [operationFilter, setOperationFilter] = useState<OperationType | null>(null);
  const [fireAfterLoad, setFireAfterLoad] = useState(false);

  // Build filter pills from actual preset data
  const operationPillOptions = useMemo(() => {
    const counts = new Map<OperationType, number>();
    for (const p of allPresets) {
      counts.set(p.operationType, (counts.get(p.operationType) ?? 0) + 1);
    }
    const pills: FilterPillOption<OperationType>[] = [];
    for (const [op, count] of counts) {
      const meta = OPERATION_METADATA[op];
      if (meta) pills.push({ value: op, label: meta.label, count });
    }
    return pills;
  }, [allPresets]);

  // Filtered list
  const filteredPresets = useMemo(
    () =>
      operationFilter === null
        ? allPresets
        : allPresets.filter((p) => p.operationType === operationFilter),
    [allPresets, operationFilter],
  );

  const selectedPreset = useMemo(
    () => (selectedId ? allPresets.find((p) => p.id === selectedId) ?? null : null),
    [allPresets, selectedId],
  );

  // Auto-fire after load completes
  useEffect(() => {
    if (fireAfterLoad && !presetLoading) {
      setFireAfterLoad(false);
      controller.generate();
    }
  }, [fireAfterLoad, presetLoading, controller]);

  const handleLoad = useCallback(
    async (presetId: string) => {
      await loadPresetAsync(presetId);
    },
    [loadPresetAsync],
  );

  const handleLoadAndGenerate = useCallback(
    async (presetId: string) => {
      const ok = await loadPresetAsync(presetId);
      if (ok) {
        setFireAfterLoad(true);
      }
    },
    [loadPresetAsync],
  );

  const handleDelete = useCallback(
    (presetId: string) => {
      deletePreset(presetId);
      if (selectedId === presetId) setSelectedId(null);
    },
    [deletePreset, selectedId],
  );

  // ── Empty state ────────────────────────────────────────────────────────
  if (allPresets.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="bookmark" size={24} className="opacity-40" />}
        message="No presets yet"
        description="Save a generation preset from the Quick Generate settings panel to see it here."
        size="md"
        className="h-full"
      />
    );
  }

  // ── Sidebar content ────────────────────────────────────────────────────
  const sidebar = (
    <SidebarPaneShell
      title="Presets"
      collapsible
      resizable
      expandedWidth={200}
      persistKey="generation-presets-sidebar"
    >
      {/* Operation filter pills */}
      {operationPillOptions.length > 1 && (
        <FilterPillGroup
          options={operationPillOptions}
          value={operationFilter}
          onChange={setOperationFilter}
          allLabel="All"
          allCount={allPresets.length}
          size="sm"
          className="mb-2"
        />
      )}

      {/* Preset list */}
      {filteredPresets.length === 0 ? (
        <EmptyState
          message="No presets for this operation."
          bordered
          className="mt-2"
        />
      ) : (
        <div className="space-y-0.5">
          {filteredPresets.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              selected={selectedId === preset.id}
              onSelect={() => setSelectedId(preset.id)}
              onDelete={() => handleDelete(preset.id)}
            />
          ))}
        </div>
      )}
    </SidebarPaneShell>
  );

  // ── Body (detail) ─────────────────────────────────────────────────────
  const body = selectedPreset ? (
    <PresetDetail
      preset={selectedPreset}
      onLoad={() => handleLoad(selectedPreset.id)}
      onLoadAndGenerate={() => handleLoadAndGenerate(selectedPreset.id)}
      loading={presetLoading}
    />
  ) : (
    <EmptyState
      message="Select a preset to inspect."
      className="h-full"
    />
  );

  return (
    <PanelShell sidebar={sidebar} sidebarWidth="w-auto" bodyScroll={false}>
      {body}
    </PanelShell>
  );
}
