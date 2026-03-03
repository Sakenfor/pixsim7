/**
 * Analyzer Catalog — Master-Detail view for analyzer definitions.
 *
 * Left sidebar: searchable, grouped-by-target list of analyzers.
 * Right detail: selected analyzer info, analysis points, instance stack.
 */
import { useEffect, useMemo, useState } from 'react';

import type {
  AnalyzerInfo,
  AnalyzerInstance,
  AnalyzerKind,
  AnalyzerTarget,
} from '@lib/api/analyzers';

// ---------------------------------------------------------------------------
// Analysis Points — describes *where* each analyzer target is invoked
// ---------------------------------------------------------------------------

interface AnalysisPointDefinition {
  id: string;
  label: string;
  description: string;
}

const ANALYSIS_POINTS: Record<AnalyzerTarget, AnalysisPointDefinition[]> = {
  prompt: [
    {
      id: 'prompt_parsing',
      label: 'Prompt parsing',
      description: 'Tag extraction during prompt editing',
    },
    {
      id: 'prompt_generation',
      label: 'Generation workflow',
      description: 'Pre-generation prompt analysis',
    },
  ],
  asset: [
    {
      id: 'asset_ingest_on_ingest',
      label: 'Asset ingestion (on_ingest)',
      description: 'Automatic analysis when assets are imported',
    },
    {
      id: 'character_ingest_face',
      label: 'Character ingest: Face',
      description: 'Face-mode character reference analysis',
    },
    {
      id: 'character_ingest_sheet',
      label: 'Character ingest: Sheet',
      description: 'Sheet/composite character reference analysis',
    },
    {
      id: 'scene_prep_location',
      label: 'Scene prep: Location',
      description: 'Location reference analysis for scene prep',
    },
    {
      id: 'scene_prep_style',
      label: 'Scene prep: Style',
      description: 'Style reference analysis for scene prep',
    },
    {
      id: 'manual_analysis_image',
      label: 'Manual analysis: Image',
      description: 'User-triggered analysis on image assets when analyzer_id is omitted',
    },
    {
      id: 'manual_analysis_video',
      label: 'Manual analysis: Video',
      description: 'User-triggered analysis on video assets when analyzer_id is omitted',
    },
  ],
};

export interface AnalysisPointSelection {
  analyzerId: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Kind badge colours
// ---------------------------------------------------------------------------

function kindBadgeClasses(kind: AnalyzerKind): string {
  switch (kind) {
    case 'llm':
      return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
    case 'vision':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    default:
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Compact instance card shown in the detail panel */
function CatalogInstanceCard({
  instance,
  onEdit,
  onDelete,
  onToggle,
  isDeleting,
}: {
  instance: AnalyzerInstance;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      className={`p-2.5 rounded-md border transition-all ${
        isDeleting
          ? 'border-red-300 dark:border-red-700 bg-red-50/60 dark:bg-red-900/20 opacity-50'
          : instance.enabled
            ? 'border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40'
            : 'border-neutral-200 dark:border-neutral-700 bg-neutral-100/60 dark:bg-neutral-800/40 opacity-60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100 truncate">
              {instance.label}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
              P:{instance.priority}
            </span>
            {instance.on_ingest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                on_ingest
              </span>
            )}
          </div>
          {instance.provider_id && (
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
              {instance.provider_id}
              {instance.model_id && <> / {instance.model_id}</>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onEdit}
            className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 transition-colors disabled:opacity-50"
          >
            Del
          </button>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={instance.enabled}
              onChange={onToggle}
              className="sr-only peer"
            />
            <div
              className={`w-8 h-[18px] rounded-full peer peer-checked:after:translate-x-3.5 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all relative ${
                instance.enabled ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-700'
              }`}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel — right side
// ---------------------------------------------------------------------------

function AnalyzerDetail({
  analyzer,
  instances,
  deletingIds,
  onEdit,
  onDelete,
  onToggle,
  onAddInstance,
  analysisPointSelections,
}: {
  analyzer: AnalyzerInfo;
  instances: AnalyzerInstance[];
  deletingIds: Set<number>;
  onEdit: (instance: AnalyzerInstance) => void;
  onDelete: (instance: AnalyzerInstance) => void;
  onToggle: (instance: AnalyzerInstance) => void;
  onAddInstance: (analyzerId: string) => void;
  analysisPointSelections: Record<string, AnalysisPointSelection>;
}) {
  const analyzerInstances = instances
    .filter((i) => i.analyzer_id === analyzer.id)
    .sort((a, b) => b.priority - a.priority);

  const analysisPoints = useMemo(() => ANALYSIS_POINTS[analyzer.target] ?? [], [analyzer.target]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(
    analysisPoints[0]?.id ?? null
  );

  useEffect(() => {
    setSelectedPointId(analysisPoints[0]?.id ?? null);
  }, [analysisPoints, analyzer.id]);

  const selectedPoint = analysisPoints.find((point) => point.id === selectedPointId) ?? analysisPoints[0] ?? null;
  const pointSelection = selectedPoint ? analysisPointSelections[selectedPoint.id] : undefined;
  const isSelectedAnalyzerForPoint = pointSelection?.analyzerId === analyzer.id;

  return (
    <div className="p-4 space-y-4 overflow-auto h-full">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {analyzer.name}
          </h3>
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${kindBadgeClasses(analyzer.kind)}`}>
            {analyzer.kind}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
            {analyzer.target}
          </span>
          {analyzer.is_default && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
              default
            </span>
          )}
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded ${
              analyzer.enabled
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}
          >
            {analyzer.enabled ? 'enabled' : 'disabled'}
          </span>
        </div>

        <div className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 mt-1">
          {analyzer.id}
        </div>

        {analyzer.description && (
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1">
            {analyzer.description}
          </p>
        )}

        {analyzer.provider_id && (
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
            Provider: <span className="font-mono">{analyzer.provider_id}</span>
            {analyzer.model_id && (
              <> / Model: <span className="font-mono">{analyzer.model_id}</span></>
            )}
          </div>
        )}
      </div>

      {/* Analysis Points */}
      {analysisPoints.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1.5">
            Analysis Points
          </h4>
          <div className="flex border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden bg-neutral-50/40 dark:bg-neutral-900/30">
            <div className="w-48 border-r border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 shrink-0">
              <div className="p-1.5 space-y-1">
                {analysisPoints.map((point) => {
                  const pointAnalyzer = analysisPointSelections[point.id]?.analyzerId;
                  const usesCurrentAnalyzer = pointAnalyzer === analyzer.id;
                  const isSelected = point.id === selectedPoint?.id;

                  return (
                    <button
                      key={point.id}
                      type="button"
                      onClick={() => setSelectedPointId(point.id)}
                      className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                        isSelected
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      <div className="text-[10px] font-medium truncate">{point.label}</div>
                      <div className="text-[9px] mt-0.5">
                        <span className={`px-1 py-0.5 rounded ${
                          usesCurrentAnalyzer
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                        }`}>
                          {usesCurrentAnalyzer ? 'selected' : 'other analyzer'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 p-2.5 min-w-0">
              {selectedPoint && (
                <div className="space-y-2 text-[10px]">
                  <div>
                    <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                      {selectedPoint.label}
                    </div>
                    <div className="text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {selectedPoint.description}
                    </div>
                  </div>

                  <div className="p-2 rounded border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/60">
                    <div className="text-neutral-500 dark:text-neutral-400">Configured analyzer</div>
                    <div className="font-mono text-[11px] text-neutral-800 dark:text-neutral-100 mt-0.5">
                      {pointSelection?.analyzerId ?? 'No default mapping'}
                    </div>
                    {pointSelection?.source && (
                      <div className="text-neutral-500 dark:text-neutral-400 mt-1">
                        Source: {pointSelection.source}
                      </div>
                    )}
                  </div>

                  <div className={`px-2 py-1 rounded text-[10px] inline-flex ${
                    isSelectedAnalyzerForPoint
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  }`}>
                    {isSelectedAnalyzerForPoint
                      ? 'This analyzer is currently selected for this analysis point.'
                      : 'A different analyzer is currently selected for this analysis point.'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Instance Options (dynamic descriptors from analyzer definition) */}
      {analyzer.instance_options && analyzer.instance_options.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1.5">
            Instance Options
          </h4>
          <div className="space-y-1">
            {analyzer.instance_options.map((opt) => (
              <div
                key={opt.id}
                className="flex items-start gap-2 text-[10px] p-1.5 rounded bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                      {opt.label}
                    </span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 font-mono">
                      {opt.type}
                    </span>
                  </div>
                  {opt.description && (
                    <div className="text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {opt.description}
                    </div>
                  )}
                  {opt.default !== undefined && opt.default !== null && (
                    <div className="text-neutral-400 dark:text-neutral-500 mt-0.5 font-mono">
                      default: {String(opt.default)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instances */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Instances ({analyzerInstances.length})
          </h4>
          <button
            onClick={() => onAddInstance(analyzer.id)}
            className="px-2 py-1 text-[10px] rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            + Add Instance
          </button>
        </div>

        {analyzerInstances.length === 0 ? (
          <div className="p-3 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-700 rounded text-center">
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
              No instances configured for this analyzer.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {analyzerInstances.map((instance) => (
              <CatalogInstanceCard
                key={instance.id}
                instance={instance}
                onEdit={() => onEdit(instance)}
                onDelete={() => onDelete(instance)}
                onToggle={() => onToggle(instance)}
                isDeleting={deletingIds.has(instance.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface AnalyzerCatalogProps {
  analyzers: AnalyzerInfo[];
  instances: AnalyzerInstance[];
  deletingIds: Set<number>;
  analysisPointSelections: Record<string, AnalysisPointSelection>;
  onEdit: (instance: AnalyzerInstance) => void;
  onDelete: (instance: AnalyzerInstance) => void;
  onToggle: (instance: AnalyzerInstance) => void;
  onAddInstance: (analyzerId: string) => void;
}

export function AnalyzerCatalog({
  analyzers,
  instances,
  deletingIds,
  analysisPointSelections,
  onEdit,
  onDelete,
  onToggle,
  onAddInstance,
}: AnalyzerCatalogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Group & filter
  const { promptGroup, assetGroup, selected } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? analyzers.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.id.toLowerCase().includes(q) ||
            a.kind.toLowerCase().includes(q)
        )
      : analyzers;

    const prompt = filtered.filter((a) => a.target === 'prompt');
    const asset = filtered.filter((a) => a.target === 'asset');

    // Resolve selected — prefer explicit selection, then first item
    const sel =
      analyzers.find((a) => a.id === selectedId) ??
      filtered[0] ??
      null;

    return { promptGroup: prompt, assetGroup: asset, selected: sel };
  }, [analyzers, searchQuery, selectedId]);

  // Auto-select first on mount
  const effectiveSelected = selected;

  return (
    <div className="flex border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden"
      style={{ height: 420 }}
    >
      {/* Left sidebar */}
      <div className="w-56 border-r border-neutral-200 dark:border-neutral-700 flex flex-col bg-neutral-50/60 dark:bg-neutral-900/40 shrink-0">
        {/* Search */}
        <div className="p-2 border-b border-neutral-200 dark:border-neutral-700">
          <input
            type="text"
            placeholder="Search analyzers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-2.5 py-1.5 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-1.5">
          {promptGroup.length === 0 && assetGroup.length === 0 ? (
            <div className="p-3 text-center text-[10px] text-neutral-500 dark:text-neutral-400">
              No analyzers found
            </div>
          ) : (
            <>
              {promptGroup.length > 0 && (
                <AnalyzerGroup
                  label="PROMPT"
                  analyzers={promptGroup}
                  instances={instances}
                  selectedId={effectiveSelected?.id ?? null}
                  onSelect={setSelectedId}
                />
              )}
              {assetGroup.length > 0 && (
                <AnalyzerGroup
                  label="ASSET"
                  analyzers={assetGroup}
                  instances={instances}
                  selectedId={effectiveSelected?.id ?? null}
                  onSelect={setSelectedId}
                />
              )}
            </>
          )}
        </div>

        {/* Footer count */}
        <div className="p-2 border-t border-neutral-200 dark:border-neutral-700 text-[10px] text-neutral-500 dark:text-neutral-400">
          {promptGroup.length} prompt / {assetGroup.length} asset
        </div>
      </div>

      {/* Right detail */}
      <div className="flex-1 bg-white dark:bg-neutral-900 min-w-0">
        {effectiveSelected ? (
          <AnalyzerDetail
            analyzer={effectiveSelected}
            instances={instances}
            deletingIds={deletingIds}
            analysisPointSelections={analysisPointSelections}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggle={onToggle}
            onAddInstance={onAddInstance}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[11px] text-neutral-500 dark:text-neutral-400">
            Select an analyzer to view details
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar group
// ---------------------------------------------------------------------------

function AnalyzerGroup({
  label,
  analyzers,
  instances,
  selectedId,
  onSelect,
}: {
  label: string;
  analyzers: AnalyzerInfo[];
  instances: AnalyzerInstance[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-1">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-2 py-1">
        {label}
      </div>
      {analyzers.map((analyzer) => {
        const instanceCount = instances.filter((i) => i.analyzer_id === analyzer.id).length;
        const isSelected = analyzer.id === selectedId;

        return (
          <button
            key={analyzer.id}
            onClick={() => onSelect(analyzer.id)}
            className={`w-full text-left px-2 py-1.5 rounded mb-0.5 transition-colors ${
              isSelected
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  analyzer.enabled
                    ? 'bg-emerald-500'
                    : 'bg-neutral-300 dark:bg-neutral-600'
                }`}
              />
              <span className="text-[11px] font-medium truncate">{analyzer.name}</span>
              <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${kindBadgeClasses(analyzer.kind)}`}>
                {analyzer.kind}
              </span>
            </div>
            {instanceCount > 0 && (
              <div className="text-[9px] text-neutral-400 dark:text-neutral-500 pl-3 mt-0.5">
                {instanceCount} instance{instanceCount !== 1 ? 's' : ''}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
