/**
 * BlockMatrixView - Reusable block coverage matrix component.
 *
 * Renders a 2D matrix grid from the block matrix endpoint, with:
 * - Configurable row/col axis keys
 * - Filter controls (package, role, category, text, tags)
 * - Heatmap-shaded cells with counts
 * - Cell click to show sample blocks
 * - Preset support for common matrices
 * - Embeddable in any panel via props
 */
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getBlockMatrix,
  getBlockTagDictionary,
  normalizeBlockTags,
  type BlockMatrixQuery,
  type BlockMatrixResponse,
  type BlockMatrixCell,
  type BlockMatrixCellSample,
  type BlockTagDictionaryResponse,
  type BlockTagNormalizeResponse,
} from '@lib/api/blockTemplates';
import { Icon } from '@lib/icons';

import type { BlockMatrixPreset } from './presets';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BlockMatrixViewProps {
  /** Initial query values (merged with defaults) */
  initialQuery?: Partial<BlockMatrixQuery>;
  /** Lock specific fields — locked fields are not editable in the UI */
  lockedFields?: Partial<Record<keyof BlockMatrixQuery, boolean>>;
  /** Presets shown as quick-select buttons */
  presets?: BlockMatrixPreset[];
  /** Title override */
  title?: string;
  /** Compact mode for embedded use */
  embedded?: boolean;
  /** Callback when user wants to open block details */
  onOpenBlock?: (blockId: string) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const AXIS_OPTIONS_PRIMITIVES = [
  { value: 'category', label: 'Category' },
  { value: 'source', label: 'Source' },
];

const AXIS_OPTIONS_LEGACY = [
  { value: 'role', label: 'Role' },
  { value: 'category', label: 'Category' },
  { value: 'package_name', label: 'Package' },
  { value: 'kind', label: 'Kind' },
  { value: 'default_intent', label: 'Intent' },
  { value: 'complexity_level', label: 'Complexity' },
];

function baseAxisOptionsWithCurrent(
  current?: string,
  source?: string,
): Array<{ value: string; label: string }> {
  const base = source === 'action_blocks' ? AXIS_OPTIONS_LEGACY : AXIS_OPTIONS_PRIMITIVES;
  const options = [...base];
  if (current && !options.some((o) => o.value === current)) {
    options.push({ value: current, label: current.startsWith('tag:') ? `Tag: ${current.slice(4)}` : current });
  }
  return options;
}

const DEFAULT_QUERY: BlockMatrixQuery = {
  row_key: 'category',
  col_key: 'tag:hardness',
  source: 'primitives',
  include_empty: false,
  sample_per_cell: 3,
  limit: 5000,
};

function parseTagCsv(tagsCsv?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tagsCsv) return out;
  for (const part of tagsCsv.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function stringifyTagCsv(tags: Record<string, unknown>): string {
  return Object.entries(tags)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:${v.join('|')}`;
      }
      return `${k}:${String(v)}`;
    })
    .join(', ');
}

// ── Heatmap color helper ───────────────────────────────────────────────────

function heatmapClass(count: number, maxCount: number): string {
  if (count === 0) return 'bg-neutral-800/30 text-neutral-600';
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio > 0.75) return 'bg-emerald-900/60 text-emerald-300';
  if (ratio > 0.5) return 'bg-emerald-900/40 text-emerald-400';
  if (ratio > 0.25) return 'bg-cyan-900/30 text-cyan-400';
  return 'bg-blue-900/20 text-blue-400';
}

// ── Component ──────────────────────────────────────────────────────────────

export function BlockMatrixView({
  initialQuery,
  lockedFields,
  presets,
  title,
  embedded = false,
  onOpenBlock,
}: BlockMatrixViewProps) {
  // ── State ──────────────────────────────────────────────────────────────

  const [query, setQuery] = useState<BlockMatrixQuery>(() => ({
    ...DEFAULT_QUERY,
    ...initialQuery,
  }));
  const [data, setData] = useState<BlockMatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<BlockMatrixCell | null>(null);
  const [tagDictionary, setTagDictionary] = useState<BlockTagDictionaryResponse | null>(null);
  const [dataQuerySnapshot, setDataQuerySnapshot] = useState<BlockMatrixQuery | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied-query' | 'copied-json' | 'error'>('idle');
  const [normalizeStatus, setNormalizeStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [normalizeResult, setNormalizeResult] = useState<BlockTagNormalizeResponse | null>(null);
  const fetchIdRef = useRef(0);
  const tagDictFetchIdRef = useRef(0);
  const copyTimerRef = useRef<number | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchMatrix = useCallback(async (q: BlockMatrixQuery) => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    setSelectedCell(null);
    try {
      const result = await getBlockMatrix(q);
      if (id === fetchIdRef.current) {
        setData(result);
        setDataQuerySnapshot({ ...q });
      }
    } catch (err) {
      if (id === fetchIdRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load matrix');
        setData(null);
        setDataQuerySnapshot(null);
      }
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchMatrix(query);
  }, [fetchMatrix, query]);

  // Fetch scoped tag dictionary (canonical keys + alias/unknown warnings) for axis suggestions.
  useEffect(() => {
    const id = ++tagDictFetchIdRef.current;
    void (async () => {
      try {
        const result = await getBlockTagDictionary({
          package_name: query.package_name,
          role: query.role,
          category: query.category,
          include_values: false,
          include_usage_examples: false,
          include_aliases: true,
        });
        if (id === tagDictFetchIdRef.current) {
          setTagDictionary(result);
        }
      } catch {
        if (id === tagDictFetchIdRef.current) {
          setTagDictionary(null);
        }
      }
    })();
  }, [query.package_name, query.role, query.category]);

  // ── Helpers ────────────────────────────────────────────────────────────

  const isPrimitives = (query.source ?? 'primitives') === 'primitives';

  const cellMap = useMemo(() => {
    if (!data) return new Map<string, BlockMatrixCell>();
    const map = new Map<string, BlockMatrixCell>();
    for (const cell of data.cells) {
      map.set(`${cell.row_value}|${cell.col_value}`, cell);
    }
    return map;
  }, [data]);

  const maxCount = useMemo(
    () => data ? Math.max(1, ...data.cells.map((c) => c.count)) : 1,
    [data],
  );

  const canonicalTagAxisOptions = useMemo(() => {
    const keys = (tagDictionary?.keys ?? [])
      .filter((k) => k.status !== 'unknown' && k.status !== 'alias_key')
      .map((k) => k.key)
      .sort();
    return keys.map((k) => ({ value: `tag:${k}`, label: `Tag: ${k}` }));
  }, [tagDictionary]);

  const aliasTagKeyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const keyEntry of tagDictionary?.keys ?? []) {
      if (keyEntry.status !== 'alias_key') continue;
      const canonical = keyEntry.aliases?.values?.$key_alias;
      if (canonical) map.set(keyEntry.key, canonical);
    }
    return map;
  }, [tagDictionary]);

  const axisAliasSuggestions = useMemo(() => {
    const suggestions: Array<{ axis: 'row' | 'col'; from: string; to: string }> = [];
    const checkAxis = (axis: 'row' | 'col', axisKey: string | undefined) => {
      if (!axisKey) return;
      const isTagAxis = axisKey.startsWith('tag:');
      const rawKey = isTagAxis ? axisKey.slice(4) : axisKey;
      const canonical = aliasTagKeyMap.get(rawKey);
      if (!canonical) return;
      suggestions.push({
        axis,
        from: axisKey,
        to: isTagAxis ? `tag:${canonical}` : canonical,
      });
    };
    checkAxis('row', query.row_key);
    checkAxis('col', query.col_key);
    return suggestions;
  }, [aliasTagKeyMap, query.col_key, query.row_key]);

  const rowAxisOptions = useMemo(() => {
    const base = baseAxisOptionsWithCurrent(query.row_key, query.source);
    const seen = new Set(base.map((o) => o.value));
    for (const opt of canonicalTagAxisOptions) {
      if (!seen.has(opt.value)) base.push(opt);
    }
    return base;
  }, [canonicalTagAxisOptions, query.row_key, query.source]);

  const colAxisOptions = useMemo(() => {
    const base = baseAxisOptionsWithCurrent(query.col_key, query.source);
    const seen = new Set(base.map((o) => o.value));
    for (const opt of canonicalTagAxisOptions) {
      if (!seen.has(opt.value)) base.push(opt);
    }
    return base;
  }, [canonicalTagAxisOptions, query.col_key]);

  const isLocked = (field: keyof BlockMatrixQuery) => lockedFields?.[field] === true;

  const updateField = <K extends keyof BlockMatrixQuery>(
    field: K,
    value: BlockMatrixQuery[K],
  ) => {
    if (isLocked(field)) return;
    setQuery((prev) => ({ ...prev, [field]: value || undefined }));
  };

  const applyPreset = (preset: BlockMatrixPreset) => {
    setQuery((prev) => ({
      ...DEFAULT_QUERY,
      // Preserve locked fields from current query
      ...(lockedFields
        ? Object.fromEntries(
            Object.entries(prev).filter(([k]) => lockedFields[k as keyof BlockMatrixQuery]),
          )
        : {}),
      ...preset.query,
    }));
  };

  const copyMatrixQuery = useCallback(async () => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    const payload = `/block-templates/meta/blocks/matrix?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopyStatus('copied-query');
    } catch {
      setCopyStatus('error');
    }
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopyStatus('idle'), 1500);
  }, [query]);

  const copyMatrixJson = useCallback(async () => {
    if (!data) return;
    const payload = JSON.stringify(
      {
        query: dataQuerySnapshot ?? query,
        matrix: data,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      setCopyStatus('copied-json');
    } catch {
      setCopyStatus('error');
    }
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopyStatus('idle'), 1500);
  }, [data, dataQuerySnapshot, query]);

  const normalizeTagsFilter = useCallback(async () => {
    const currentCsv = query.tags?.trim();
    if (!currentCsv) {
      setNormalizeResult(null);
      setNormalizeStatus('idle');
      return;
    }
    setNormalizeStatus('running');
    try {
      const parsed = parseTagCsv(currentCsv);
      const result = await normalizeBlockTags({
        tags: parsed,
        apply_value_aliases: true,
      });
      setNormalizeResult(result);
      setNormalizeStatus('done');
      if (result.changed) {
        updateField('tags', stringifyTagCsv(result.normalized_tags));
      }
    } catch {
      setNormalizeStatus('error');
    }
  }, [query.tags]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={clsx('flex flex-col h-full min-h-0', !embedded && 'bg-neutral-900')}>
      {/* Header */}
      {!embedded && (
        <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="grid" size={14} className="text-neutral-400" />
            <span className="text-sm font-medium text-neutral-200">
              {title ?? 'Block Matrix'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void fetchMatrix(query)}
            disabled={loading}
            className="text-xs px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            <Icon name="refresh" size={12} className="inline mr-1" />
            Refresh
          </button>
        </div>
      )}

      {/* Controls bar */}
      <div className="px-3 py-2 border-b border-neutral-800 space-y-2 shrink-0">
        {/* Axis selectors */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            Rows
            <select
              value={query.row_key}
              onChange={(e) => updateField('row_key', e.target.value)}
              disabled={isLocked('row_key')}
              className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-200 text-[11px] outline-none disabled:opacity-50"
            >
              {rowAxisOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            Cols
            <select
              value={query.col_key}
              onChange={(e) => updateField('col_key', e.target.value)}
              disabled={isLocked('col_key')}
              className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-200 text-[11px] outline-none disabled:opacity-50"
            >
              {colAxisOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={query.include_empty ?? false}
              onChange={(e) => updateField('include_empty', e.target.checked)}
              className="accent-blue-500"
            />
            Show empty
          </label>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {isPrimitives && !isLocked('source') && (
            <select
              value={query.source ?? 'primitives'}
              onChange={(e) => updateField('source', e.target.value as 'primitives' | 'action_blocks')}
              className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-200 outline-none w-24"
            >
              <option value="primitives">Primitives</option>
              <option value="action_blocks">Legacy</option>
            </select>
          )}
          {!isPrimitives && !isLocked('package_name') && (
            <input
              type="text"
              value={query.package_name ?? ''}
              onChange={(e) => updateField('package_name', e.target.value || undefined)}
              placeholder="package"
              className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 w-24"
            />
          )}
          {!isPrimitives && !isLocked('role') && (
            <input
              type="text"
              value={query.role ?? ''}
              onChange={(e) => updateField('role', e.target.value || undefined)}
              placeholder="role"
              className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 w-20"
            />
          )}
          {!isLocked('category') && (
            <input
              type="text"
              value={query.category ?? ''}
              onChange={(e) => updateField('category', e.target.value || undefined)}
              placeholder="category"
              className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 w-24"
            />
          )}
          {!isLocked('tags') && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={query.tags ?? ''}
                onChange={(e) => {
                  setNormalizeResult(null);
                  setNormalizeStatus('idle');
                  updateField('tags', e.target.value || undefined);
                }}
                placeholder="tags (key:val,...)"
                className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 w-36"
              />
              <button
                type="button"
                onClick={() => void normalizeTagsFilter()}
                disabled={!query.tags || normalizeStatus === 'running'}
                className="px-1.5 py-0.5 rounded border border-neutral-700 text-[10px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                title="Canonicalize tag aliases/values using the tag dictionary"
              >
                {normalizeStatus === 'running' ? '...' : 'Normalize Tags'}
              </button>
            </div>
          )}
          {!isLocked('q') && (
            <input
              type="text"
              value={query.q ?? ''}
              onChange={(e) => updateField('q', e.target.value || undefined)}
              placeholder="search text"
              className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 w-28"
            />
          )}
        </div>

        {/* Presets */}
        {presets && presets.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-neutral-500">Presets:</span>
            {presets.map((p) => (
              <button
                key={p.id ?? p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
                title={p.description}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {tagDictionary && (
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            <span className="text-neutral-500">
              Tag dictionary: {(tagDictionary.keys ?? []).filter((k) => k.status !== 'unknown').length} known keys
            </span>
            {(tagDictionary.warnings ?? []).slice(0, 2).map((w) => (
              <span
                key={`${w.kind}:${w.keys.join(',')}`}
                className={clsx(
                  'px-1.5 py-0.5 rounded border',
                  w.kind === 'unknown_keys_present'
                    ? 'border-amber-700/50 text-amber-300'
                    : 'border-cyan-700/50 text-cyan-300',
                )}
                title={`${w.message}${w.keys.length ? ` (${w.keys.join(', ')})` : ''}`}
              >
                {w.kind === 'unknown_keys_present' ? 'unknown tag keys in scope' : 'alias tag keys in scope'}
              </span>
            ))}
            {axisAliasSuggestions.map((s) => (
              <button
                key={`${s.axis}:${s.from}->${s.to}`}
                type="button"
                onClick={() => updateField(s.axis === 'row' ? 'row_key' : 'col_key', s.to)}
                className="px-1.5 py-0.5 rounded border border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/20"
                title={`Switch ${s.axis} axis to canonical key`}
              >
                Use canonical {s.axis}: {s.to}
              </button>
            ))}
          </div>
        )}

        {normalizeResult && (
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            <span className="text-neutral-500">
              tag normalize:
            </span>
            <span className={clsx(normalizeResult.changed ? 'text-emerald-300' : 'text-neutral-400')}>
              {normalizeResult.changed ? 'updated' : 'no changes'}
            </span>
            {normalizeResult.key_changes.length > 0 && (
              <span className="px-1.5 py-0.5 rounded border border-cyan-700/40 text-cyan-300">
                {normalizeResult.key_changes.length} key alias{normalizeResult.key_changes.length === 1 ? '' : 'es'}
              </span>
            )}
            {normalizeResult.value_changes.length > 0 && (
              <span className="px-1.5 py-0.5 rounded border border-emerald-700/40 text-emerald-300">
                {normalizeResult.value_changes.length} value alias{normalizeResult.value_changes.length === 1 ? '' : 'es'}
              </span>
            )}
            {normalizeResult.unknown_keys.length > 0 && (
              <span
                className="px-1.5 py-0.5 rounded border border-amber-700/40 text-amber-300"
                title={normalizeResult.unknown_keys.join(', ')}
              >
                unknown: {normalizeResult.unknown_keys.join(', ')}
              </span>
            )}
            {normalizeResult.warnings.slice(0, 2).map((w, idx) => (
              <span
                key={`${w.kind}:${idx}`}
                className="px-1.5 py-0.5 rounded border border-amber-700/40 text-amber-300"
                title={w.message}
              >
                {w.kind}
              </span>
            ))}
          </div>
        )}
        {normalizeStatus === 'error' && !normalizeResult && (
          <div className="text-[10px] text-amber-300">tag normalize failed</div>
        )}

        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          <button
            type="button"
            onClick={() => void copyMatrixQuery()}
            className="px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
            title="Copy current matrix endpoint query"
          >
            <Icon name="copy" size={11} className="inline mr-1" />
            Copy Query
          </button>
          <button
            type="button"
            onClick={() => void copyMatrixJson()}
            disabled={!data}
            className="px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-50"
            title="Copy current matrix response JSON"
          >
            <Icon name="copy" size={11} className="inline mr-1" />
            Copy JSON
          </button>
          {copyStatus === 'copied-query' && <span className="text-emerald-300">query copied</span>}
          {copyStatus === 'copied-json' && <span className="text-emerald-300">json copied</span>}
          {copyStatus === 'error' && <span className="text-amber-300">clipboard failed</span>}
        </div>
      </div>

      {/* Matrix grid + detail split */}
      <div className="flex-1 min-h-0 flex">
        {/* Grid area */}
        <div className={clsx('flex-1 min-w-0 overflow-auto', selectedCell && 'border-r border-neutral-800')}>
          {loading && (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-neutral-500">Loading matrix...</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-red-400">{error}</span>
            </div>
          )}
          {!loading && !error && data && data.row_values.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-neutral-500">No data for current filters</span>
            </div>
          )}
          {!loading && !error && data && data.row_values.length > 0 && (
            <MatrixGrid
              data={data}
              cellMap={cellMap}
              maxCount={maxCount}
              selectedCell={selectedCell}
              onCellClick={setSelectedCell}
            />
          )}
        </div>

        {/* Detail sidebar */}
        {selectedCell && (
          <CellDetail
            cell={selectedCell}
            rowKey={data?.row_key ?? ''}
            colKey={data?.col_key ?? ''}
            onClose={() => setSelectedCell(null)}
            onOpenBlock={onOpenBlock}
          />
        )}
      </div>

      {/* Footer stats */}
      {data && !loading && (
        <div className="px-3 py-1 border-t border-neutral-800 text-[10px] text-neutral-500 flex items-center gap-3 shrink-0">
          <span>{data.total_blocks} blocks</span>
          <span>{data.row_values.length} rows</span>
          <span>{data.col_values.length} cols</span>
          <span>{data.cells.length} cells</span>
        </div>
      )}
    </div>
  );
}

// ── Matrix Grid ────────────────────────────────────────────────────────────

function MatrixGrid({
  data,
  cellMap,
  maxCount,
  selectedCell,
  onCellClick,
}: {
  data: BlockMatrixResponse;
  cellMap: Map<string, BlockMatrixCell>;
  maxCount: number;
  selectedCell: BlockMatrixCell | null;
  onCellClick: (cell: BlockMatrixCell) => void;
}) {
  return (
    <div className="inline-block min-w-full">
      <table className="border-collapse text-[11px]">
        <thead>
          <tr>
            {/* Corner cell with axis labels */}
            <th className="sticky left-0 top-0 z-20 bg-neutral-900 border-b border-r border-neutral-700 px-2 py-1.5 text-left">
              <div className="text-[9px] text-neutral-500 font-normal">
                <span>{data.row_key}</span>
                <span className="mx-1">/</span>
                <span>{data.col_key}</span>
              </div>
            </th>
            {data.col_values.map((col) => (
              <th
                key={col}
                className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-700 px-2 py-1.5 text-center font-medium text-neutral-300 whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.row_values.map((row) => (
            <tr key={row}>
              <td className="sticky left-0 z-10 bg-neutral-900 border-r border-neutral-700 px-2 py-1 font-medium text-neutral-300 whitespace-nowrap">
                {row}
              </td>
              {data.col_values.map((col) => {
                const key = `${row}|${col}`;
                const cell = cellMap.get(key);
                const count = cell?.count ?? 0;
                const isSelected =
                  selectedCell?.row_value === row && selectedCell?.col_value === col;

                return (
                  <td
                    key={col}
                    onClick={() => {
                      if (cell) onCellClick(cell);
                      else onCellClick({ row_value: row, col_value: col, count: 0, samples: [] });
                    }}
                    className={clsx(
                      'px-2 py-1 text-center cursor-pointer transition-colors border border-neutral-800/50 tabular-nums min-w-[40px]',
                      heatmapClass(count, maxCount),
                      isSelected && 'ring-1 ring-blue-500 ring-inset',
                    )}
                    title={`${row} / ${col}: ${count}`}
                  >
                    {count > 0 ? count : <span className="text-neutral-700">-</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Cell Detail Sidebar ────────────────────────────────────────────────────

function CellDetail({
  cell,
  rowKey,
  colKey,
  onClose,
  onOpenBlock,
}: {
  cell: BlockMatrixCell;
  rowKey: string;
  colKey: string;
  onClose: () => void;
  onOpenBlock?: (blockId: string) => void;
}) {
  return (
    <div className="w-56 shrink-0 overflow-y-auto p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-neutral-200">Cell Detail</span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded text-neutral-500 hover:text-neutral-300"
        >
          <Icon name="x" size={12} />
        </button>
      </div>
      <div className="space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span className="text-neutral-500">{rowKey}</span>
          <span className="text-neutral-200 font-mono">{cell.row_value}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">{colKey}</span>
          <span className="text-neutral-200 font-mono">{cell.col_value}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Count</span>
          <span className="text-neutral-200 font-medium">{cell.count}</span>
        </div>
      </div>

      {cell.samples.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
            Samples ({cell.samples.length})
          </div>
          {cell.samples.map((s) => (
            <SampleRow key={s.id} sample={s} onOpen={onOpenBlock} />
          ))}
        </div>
      )}

      {cell.count === 0 && (
        <div className="text-[10px] text-amber-500/70 p-2 rounded border border-amber-800/30 bg-amber-900/10">
          No blocks in this cell. Consider adding blocks with {rowKey}={cell.row_value}, {colKey}={cell.col_value}.
        </div>
      )}
    </div>
  );
}

function SampleRow({
  sample,
  onOpen,
}: {
  sample: BlockMatrixCellSample;
  onOpen?: (blockId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(sample.block_id)}
      disabled={!onOpen}
      className="w-full text-left p-1.5 rounded border border-neutral-700/50 hover:bg-neutral-800/50 disabled:cursor-default"
    >
      <div className="text-[10px] text-neutral-200 font-mono truncate">{sample.block_id}</div>
      <div className="text-[9px] text-neutral-500 truncate">
        {sample.category ?? 'no cat'}
        {sample.role && ` | ${sample.role}`}
        {sample.package_name && ` | ${sample.package_name}`}
      </div>
    </button>
  );
}
