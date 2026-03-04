/**
 * Analyzer Catalog - Master-detail view for analyzer definitions.
 *
 * Left sidebar: searchable/filterable analyzer list.
 * Right detail: selected analyzer metadata, analysis-point usage, instance stack.
 */
import { useEffect, useMemo, useState } from 'react';

import type {
  AnalyzerInfo,
  AnalyzerInputModality,
  AnalyzerInstance,
  AnalyzerKind,
  AnalyzerTarget,
  AnalyzerTaskFamily,
} from '@lib/api/analyzers';

export interface CatalogAnalysisPointDefinition {
  id: string;
  label: string;
  description: string;
  target: AnalyzerTarget;
}

export interface AnalysisPointSelection {
  analyzerId: string;
  analyzerIds?: string[];
  source: string;
}

const MODALITY_ORDER: AnalyzerInputModality[] = ['text', 'image', 'video', 'audio', 'multimodal'];
const TASK_FAMILY_ORDER: AnalyzerTaskFamily[] = [
  'parse',
  'tag',
  'caption',
  'ocr',
  'detection',
  'moderation',
  'embedding',
  'custom',
];

function normalizeSelectionChain(selection?: AnalysisPointSelection): string[] {
  if (!selection) return [];
  if (Array.isArray(selection.analyzerIds) && selection.analyzerIds.length > 0) {
    return selection.analyzerIds;
  }
  return selection.analyzerId ? [selection.analyzerId] : [];
}

function summarizeChain(selection?: AnalysisPointSelection): string {
  const chain = normalizeSelectionChain(selection);
  if (chain.length === 0) return 'unresolved';
  if (chain.length <= 2) return chain.join(' -> ');
  return `${chain[0]} -> ${chain[1]} (+${chain.length - 2})`;
}

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

function modalityBadgeClasses(modality: AnalyzerInputModality): string {
  switch (modality) {
    case 'text':
      return 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400';
    case 'image':
      return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
    case 'video':
      return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400';
    case 'audio':
      return 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400';
    default:
      return 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400';
  }
}

function taskBadgeClasses(taskFamily: AnalyzerTaskFamily): string {
  switch (taskFamily) {
    case 'parse':
      return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
    case 'detection':
      return 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400';
    case 'ocr':
      return 'bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-400';
    default:
      return 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300';
  }
}

function targetDisplay(target: AnalyzerTarget): string {
  return target === 'prompt' ? 'text' : 'media';
}

function labelize(text: string): string {
  return text.replace(/_/g, ' ');
}

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

function AnalyzerDetail({
  analyzer,
  analyzers,
  instances,
  analysisPoints,
  deletingIds,
  onEdit,
  onDelete,
  onToggle,
  onAddInstance,
  analysisPointSelections,
}: {
  analyzer: AnalyzerInfo;
  analyzers: AnalyzerInfo[];
  instances: AnalyzerInstance[];
  analysisPoints: CatalogAnalysisPointDefinition[];
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

  const analyzersById = useMemo(
    () => new Map(analyzers.map((entry) => [entry.id, entry])),
    [analyzers]
  );

  const pointsForTarget = useMemo(
    () => analysisPoints.filter((point) => point.target === analyzer.target),
    [analysisPoints, analyzer.target]
  );
  const [selectedPointId, setSelectedPointId] = useState<string | null>(pointsForTarget[0]?.id ?? null);

  useEffect(() => {
    setSelectedPointId(pointsForTarget[0]?.id ?? null);
  }, [pointsForTarget, analyzer.id]);

  const selectedPoint = pointsForTarget.find((point) => point.id === selectedPointId) ?? pointsForTarget[0] ?? null;
  const pointSelection = selectedPoint ? analysisPointSelections[selectedPoint.id] : undefined;
  const selectedChain = normalizeSelectionChain(pointSelection);
  const analyzerChainIndex = selectedChain.indexOf(analyzer.id);
  const analyzerChainStatus =
    analyzerChainIndex === 0
      ? 'primary'
      : analyzerChainIndex > 0
        ? `fallback #${analyzerChainIndex + 1}`
        : 'not selected';

  const analyzerModality = analyzer.input_modality ?? 'multimodal';
  const analyzerTaskFamily = analyzer.task_family ?? 'custom';

  return (
    <div className="p-4 space-y-4 overflow-auto h-full">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{analyzer.name}</h3>
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${kindBadgeClasses(analyzer.kind)}`}>
            {analyzer.kind}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${modalityBadgeClasses(analyzerModality)}`}>
            {analyzerModality}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${taskBadgeClasses(analyzerTaskFamily)}`}>
            {labelize(analyzerTaskFamily)}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
            {targetDisplay(analyzer.target)}
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

        <div className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 mt-1">{analyzer.id}</div>

        {analyzer.description && (
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1">{analyzer.description}</p>
        )}

        {analyzer.provider_id && (
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
            Provider: <span className="font-mono">{analyzer.provider_id}</span>
            {analyzer.model_id && (
              <>
                {' '}
                / Model: <span className="font-mono">{analyzer.model_id}</span>
              </>
            )}
          </div>
        )}
      </div>

      {pointsForTarget.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1.5">
            Analysis Points
          </h4>
          <div className="flex border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden bg-neutral-50/40 dark:bg-neutral-900/30">
            <div className="w-56 border-r border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 shrink-0">
              <div className="p-1.5 space-y-1">
                {pointsForTarget.map((point) => {
                  const pointChain = normalizeSelectionChain(analysisPointSelections[point.id]);
                  const chainIndex = pointChain.indexOf(analyzer.id);
                  const isSelected = point.id === selectedPoint?.id;
                  const statusLabel =
                    chainIndex === 0 ? 'primary' : chainIndex > 0 ? `fallback #${chainIndex + 1}` : 'other';

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
                      <div className="text-[9px] font-mono text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                        {summarizeChain(analysisPointSelections[point.id])}
                      </div>
                      <div className="text-[9px] mt-1">
                        <span
                          className={`px-1 py-0.5 rounded ${
                            chainIndex >= 0
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                          }`}
                        >
                          {statusLabel}
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
                    <div className="text-neutral-500 dark:text-neutral-400 mt-0.5">{selectedPoint.description}</div>
                  </div>

                  <div className="p-2 rounded border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/60">
                    <div className="text-neutral-500 dark:text-neutral-400">Configured analyzer chain</div>
                    {selectedChain.length > 0 ? (
                      <div className="space-y-1 mt-1">
                        {selectedChain.map((analyzerId, index) => {
                          const linkedAnalyzer = analyzersById.get(analyzerId);
                          return (
                            <div key={`${analyzerId}-${index}`} className="font-mono text-[11px] text-neutral-800 dark:text-neutral-100">
                              {index + 1}. {analyzerId}
                              {linkedAnalyzer && (
                                <span className="font-sans text-[10px] text-neutral-500 dark:text-neutral-400 ml-1">
                                  ({linkedAnalyzer.name})
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="font-mono text-[11px] text-neutral-800 dark:text-neutral-100 mt-0.5">
                        No default mapping
                      </div>
                    )}
                    {pointSelection?.source && (
                      <div className="text-neutral-500 dark:text-neutral-400 mt-1">Source: {pointSelection.source}</div>
                    )}
                  </div>

                  <div
                    className={`px-2 py-1 rounded text-[10px] inline-flex ${
                      analyzerChainIndex >= 0
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {analyzerChainIndex >= 0
                      ? `This analyzer is in the chain as ${analyzerChainStatus}.`
                      : 'This analyzer is not currently in this analysis-point chain.'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">{opt.label}</span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 font-mono">
                      {opt.type}
                    </span>
                  </div>
                  {opt.description && (
                    <div className="text-neutral-500 dark:text-neutral-400 mt-0.5">{opt.description}</div>
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
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">No instances configured for this analyzer.</p>
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

export interface AnalyzerCatalogProps {
  analyzers: AnalyzerInfo[];
  instances: AnalyzerInstance[];
  deletingIds: Set<number>;
  analysisPoints: CatalogAnalysisPointDefinition[];
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
  analysisPoints,
  analysisPointSelections,
  onEdit,
  onDelete,
  onToggle,
  onAddInstance,
}: AnalyzerCatalogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetFilter, setTargetFilter] = useState<'all' | AnalyzerTarget>('all');
  const [modalityFilter, setModalityFilter] = useState<'all' | AnalyzerInputModality>('all');
  const [taskFamilyFilter, setTaskFamilyFilter] = useState<'all' | AnalyzerTaskFamily>('all');

  const modalityOptions = useMemo(() => {
    const values = new Set<AnalyzerInputModality>();
    for (const analyzer of analyzers) {
      values.add(analyzer.input_modality ?? 'multimodal');
    }
    return MODALITY_ORDER.filter((value) => values.has(value));
  }, [analyzers]);

  const taskFamilyOptions = useMemo(() => {
    const values = new Set<AnalyzerTaskFamily>();
    for (const analyzer of analyzers) {
      values.add(analyzer.task_family ?? 'custom');
    }
    return TASK_FAMILY_ORDER.filter((value) => values.has(value));
  }, [analyzers]);

  const { promptGroup, assetGroup, filtered, selected } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filteredAnalyzers = analyzers.filter((analyzer) => {
      const analyzerModality = analyzer.input_modality ?? 'multimodal';
      const analyzerTaskFamily = analyzer.task_family ?? 'custom';

      if (targetFilter !== 'all' && analyzer.target !== targetFilter) {
        return false;
      }
      if (modalityFilter !== 'all' && analyzerModality !== modalityFilter) {
        return false;
      }
      if (taskFamilyFilter !== 'all' && analyzerTaskFamily !== taskFamilyFilter) {
        return false;
      }

      if (!q) return true;
      return (
        analyzer.name.toLowerCase().includes(q) ||
        analyzer.id.toLowerCase().includes(q) ||
        analyzer.kind.toLowerCase().includes(q) ||
        analyzer.target.toLowerCase().includes(q) ||
        analyzerModality.toLowerCase().includes(q) ||
        analyzerTaskFamily.toLowerCase().includes(q)
      );
    });

    const prompt = filteredAnalyzers.filter((analyzer) => analyzer.target === 'prompt');
    const asset = filteredAnalyzers.filter((analyzer) => analyzer.target === 'asset');

    const selectedAnalyzer =
      filteredAnalyzers.find((analyzer) => analyzer.id === selectedId) ?? filteredAnalyzers[0] ?? null;

    return {
      promptGroup: prompt,
      assetGroup: asset,
      filtered: filteredAnalyzers,
      selected: selectedAnalyzer,
    };
  }, [analyzers, modalityFilter, searchQuery, selectedId, targetFilter, taskFamilyFilter]);

  return (
    <div className="flex border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden" style={{ height: 460 }}>
      <div className="w-72 border-r border-neutral-200 dark:border-neutral-700 flex flex-col bg-neutral-50/60 dark:bg-neutral-900/40 shrink-0">
        <div className="p-2 border-b border-neutral-200 dark:border-neutral-700 space-y-1.5">
          <input
            type="text"
            placeholder="Search analyzers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-2.5 py-1.5 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
          />
          <div className="grid grid-cols-1 gap-1.5">
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value as 'all' | AnalyzerTarget)}
              className="w-full px-2.5 py-1 text-[10px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
            >
              <option value="all">All targets</option>
              <option value="prompt">Text (prompt)</option>
              <option value="asset">Media (asset)</option>
            </select>
            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value as 'all' | AnalyzerInputModality)}
              className="w-full px-2.5 py-1 text-[10px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
            >
              <option value="all">All modalities</option>
              {modalityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={taskFamilyFilter}
              onChange={(e) => setTaskFamilyFilter(e.target.value as 'all' | AnalyzerTaskFamily)}
              className="w-full px-2.5 py-1 text-[10px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
            >
              <option value="all">All task families</option>
              {taskFamilyOptions.map((option) => (
                <option key={option} value={option}>
                  {labelize(option)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-1.5">
          {promptGroup.length === 0 && assetGroup.length === 0 ? (
            <div className="p-3 text-center text-[10px] text-neutral-500 dark:text-neutral-400">No analyzers found</div>
          ) : (
            <>
              {promptGroup.length > 0 && (
                <AnalyzerGroup
                  label="TEXT (PROMPT)"
                  analyzers={promptGroup}
                  instances={instances}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                />
              )}
              {assetGroup.length > 0 && (
                <AnalyzerGroup
                  label="MEDIA (ASSET)"
                  analyzers={assetGroup}
                  instances={instances}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                />
              )}
            </>
          )}
        </div>

        <div className="p-2 border-t border-neutral-200 dark:border-neutral-700 text-[10px] text-neutral-500 dark:text-neutral-400">
          Showing {filtered.length} / {analyzers.length}
        </div>
      </div>

      <div className="flex-1 bg-white dark:bg-neutral-900 min-w-0">
        {selected ? (
          <AnalyzerDetail
            analyzer={selected}
            analyzers={analyzers}
            instances={instances}
            analysisPoints={analysisPoints}
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
        const instanceCount = instances.filter((instance) => instance.analyzer_id === analyzer.id).length;
        const isSelected = analyzer.id === selectedId;
        const analyzerModality = analyzer.input_modality ?? 'multimodal';
        const analyzerTaskFamily = analyzer.task_family ?? 'custom';

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
                  analyzer.enabled ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'
                }`}
              />
              <span className="text-[11px] font-medium truncate">{analyzer.name}</span>
              <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${kindBadgeClasses(analyzer.kind)}`}>
                {analyzer.kind}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 pl-3 text-[9px]">
              <span className={`px-1 py-0.5 rounded ${modalityBadgeClasses(analyzerModality)}`}>
                {analyzerModality}
              </span>
              <span className={`px-1 py-0.5 rounded ${taskBadgeClasses(analyzerTaskFamily)}`}>
                {labelize(analyzerTaskFamily)}
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
