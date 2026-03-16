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

import { ClientFilterBar } from '@features/gallery/components/ClientFilterBar';
import type { ClientFilterDef, ClientFilterValue } from '@features/gallery/lib/useClientFilters';

import type { BlockMatrixPreset } from './presets';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BlockMatrixViewProps {
  /** Initial query values (merged with defaults) */
  initialQuery?: Partial<BlockMatrixQuery>;
  /** Lock specific fields — locked fields are not editable in the UI */
  lockedFields?: Partial<Record<keyof BlockMatrixQuery, boolean>>;
  /** Presets shown in a searchable selector */
  presets?: BlockMatrixPreset[];
  /** Title override */
  title?: string;
  /** Compact mode for embedded use */
  embedded?: boolean;
  /** Callback when user wants to open block details */
  onOpenBlock?: (blockId: string) => void;
}

/** Selection can be a single cell, an entire row, an entire column, or multiple cells */
type MatrixSelection =
  | { kind: 'cell'; cells: BlockMatrixCell[] }
  | { kind: 'row'; rowValue: string }
  | { kind: 'col'; colValue: string }
  | null;

// ── Constants ──────────────────────────────────────────────────────────────

const AXIS_OPTIONS_PRIMITIVES = [
  { value: 'composition_role', label: 'Composition Role' },
  { value: 'category', label: 'Category' },
  { value: 'package_name', label: 'Package' },
  { value: 'source', label: 'Source' },
];

function baseAxisOptionsWithCurrent(
  current?: string,
): Array<{ value: string; label: string }> {
  const options = [...AXIS_OPTIONS_PRIMITIVES];
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

const PRESET_SOURCE_FILTER_KEY = 'preset-source';
const PRESET_SEARCH_FILTER_KEY = 'preset-search';

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

function presetSourceBadgeClass(source: BlockMatrixPreset['source']): string {
  if (source === 'pack') return 'border-emerald-700/40 text-emerald-300';
  if (source === 'template') return 'border-cyan-700/40 text-cyan-300';
  if (source === 'context') return 'border-amber-700/40 text-amber-300';
  return 'border-neutral-700 text-neutral-400';
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

  const [query, setQuery] = useState<BlockMatrixQuery>(() => {
    const next: BlockMatrixQuery = {
      ...DEFAULT_QUERY,
      ...initialQuery,
      source: 'primitives',
      composition_role: undefined,
      kind: undefined,
    };
    return next;
  });
  const [data, setData] = useState<BlockMatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<MatrixSelection>(null);
  const [tagDictionary, setTagDictionary] = useState<BlockTagDictionaryResponse | null>(null);
  const [dataQuerySnapshot, setDataQuerySnapshot] = useState<BlockMatrixQuery | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied-query' | 'copied-json' | 'error'>('idle');
  const [normalizeStatus, setNormalizeStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [normalizeResult, setNormalizeResult] = useState<BlockTagNormalizeResponse | null>(null);
  const [presetFilter, setPresetFilter] = useState('');
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [selectedPresetSources, setSelectedPresetSources] = useState<string[]>([]);
  const fetchIdRef = useRef(0);
  const tagDictFetchIdRef = useRef(0);
  const copyTimerRef = useRef<number | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchMatrix = useCallback(async (q: BlockMatrixQuery) => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    setSelection(null);
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
          role: query.composition_role,
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
  }, [query.package_name, query.composition_role, query.category]);

  // ── Helpers ────────────────────────────────────────────────────────────

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

  const rowTotals = useMemo(() => {
    if (!data) return new Map<string, number>();
    const totals = new Map<string, number>();
    for (const row of data.row_values) totals.set(row, 0);
    for (const cell of data.cells) {
      totals.set(cell.row_value, (totals.get(cell.row_value) ?? 0) + cell.count);
    }
    return totals;
  }, [data]);

  const colTotals = useMemo(() => {
    if (!data) return new Map<string, number>();
    const totals = new Map<string, number>();
    for (const col of data.col_values) totals.set(col, 0);
    for (const cell of data.cells) {
      totals.set(cell.col_value, (totals.get(cell.col_value) ?? 0) + cell.count);
    }
    return totals;
  }, [data]);

  const maxRowTotal = useMemo(
    () => Math.max(1, ...Array.from(rowTotals.values())),
    [rowTotals],
  );

  const maxColTotal = useMemo(
    () => Math.max(1, ...Array.from(colTotals.values())),
    [colTotals],
  );

  const grandTotal = useMemo(
    () => data?.cells.reduce((sum, c) => sum + c.count, 0) ?? 0,
    [data],
  );

  // Resolve selection to cells for the detail sidebar
  const selectedCells = useMemo<BlockMatrixCell[]>(() => {
    if (!selection || !data) return [];
    if (selection.kind === 'cell') return selection.cells;
    if (selection.kind === 'row') {
      return data.col_values.map((col) => {
        const key = `${selection.rowValue}|${col}`;
        return cellMap.get(key) ?? { row_value: selection.rowValue, col_value: col, count: 0, samples: [] };
      }).filter((c) => c.count > 0);
    }
    if (selection.kind === 'col') {
      return data.row_values.map((row) => {
        const key = `${row}|${selection.colValue}`;
        return cellMap.get(key) ?? { row_value: row, col_value: selection.colValue, count: 0, samples: [] };
      }).filter((c) => c.count > 0);
    }
    return [];
  }, [selection, data, cellMap]);

  const handleCellClick = useCallback((cell: BlockMatrixCell, ctrlKey: boolean) => {
    if (ctrlKey && selection?.kind === 'cell') {
      // Toggle cell in multi-select
      const existing = selection.cells;
      const idx = existing.findIndex(
        (c) => c.row_value === cell.row_value && c.col_value === cell.col_value,
      );
      if (idx >= 0) {
        const next = existing.filter((_, i) => i !== idx);
        setSelection(next.length > 0 ? { kind: 'cell', cells: next } : null);
      } else {
        setSelection({ kind: 'cell', cells: [...existing, cell] });
      }
    } else {
      setSelection({ kind: 'cell', cells: [cell] });
    }
  }, [selection]);

  const handleRowClick = useCallback((rowValue: string) => {
    if (selection?.kind === 'row' && selection.rowValue === rowValue) {
      setSelection(null);
    } else {
      setSelection({ kind: 'row', rowValue });
    }
  }, [selection]);

  const handleColClick = useCallback((colValue: string) => {
    if (selection?.kind === 'col' && selection.colValue === colValue) {
      setSelection(null);
    } else {
      setSelection({ kind: 'col', colValue });
    }
  }, [selection]);

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
    const base = baseAxisOptionsWithCurrent(query.row_key);
    const seen = new Set(base.map((o) => o.value));
    for (const opt of canonicalTagAxisOptions) {
      if (!seen.has(opt.value)) base.push(opt);
    }
    return base;
  }, [canonicalTagAxisOptions, query.row_key]);

  const colAxisOptions = useMemo(() => {
    const base = baseAxisOptionsWithCurrent(query.col_key);
    const seen = new Set(base.map((o) => o.value));
    for (const opt of canonicalTagAxisOptions) {
      if (!seen.has(opt.value)) base.push(opt);
    }
    return base;
  }, [canonicalTagAxisOptions, query.col_key]);

  const presetOptions = useMemo(
    () => (presets ?? []).map((preset, index) => ({
      key:
        `${preset.id?.trim() || preset.label.trim().toLowerCase().replace(/\s+/g, '-')}` +
        `:${index}`,
      preset,
    })),
    [presets],
  );

  const presetSourceOptions = useMemo(() => {
    const sourceSet = new Set<string>();
    for (const option of presetOptions) {
      sourceSet.add(option.preset.source ?? 'preset');
    }
    return Array.from(sourceSet).sort();
  }, [presetOptions]);

  const selectedPresetSourceSet = useMemo(
    () => new Set(selectedPresetSources),
    [selectedPresetSources],
  );

  useEffect(() => {
    if (presetSourceOptions.length === 0) {
      setSelectedPresetSources([]);
      return;
    }
    setSelectedPresetSources((prev) => {
      const next = prev.filter((source) => presetSourceOptions.includes(source));
      if (next.length > 0) return next;
      return [...presetSourceOptions];
    });
  }, [presetSourceOptions]);

  const filteredPresetOptions = useMemo(() => {
    const normalizedFilter = presetFilter.trim().toLowerCase();
    return presetOptions.filter(({ preset }) => {
      const source = preset.source ?? 'preset';
      if (selectedPresetSourceSet.size > 0 && !selectedPresetSourceSet.has(source)) {
        return false;
      }
      if (!normalizedFilter) return true;
      const haystack = [
        preset.label,
        preset.description ?? '',
        preset.source ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedFilter);
    });
  }, [presetFilter, presetOptions, selectedPresetSourceSet]);

  const sourceFilteredPresetOptions = useMemo(() => {
    if (selectedPresetSourceSet.size === 0) return presetOptions;
    return presetOptions.filter(({ preset }) => selectedPresetSourceSet.has(preset.source ?? 'preset'));
  }, [presetOptions, selectedPresetSourceSet]);

  useEffect(() => {
    if (filteredPresetOptions.length === 0) {
      if (selectedPresetKey) setSelectedPresetKey('');
      return;
    }
    if (!filteredPresetOptions.some((option) => option.key === selectedPresetKey)) {
      setSelectedPresetKey(filteredPresetOptions[0].key);
    }
  }, [filteredPresetOptions, selectedPresetKey]);

  const isLocked = (field: keyof BlockMatrixQuery) => lockedFields?.[field] === true;

  const updateField = <K extends keyof BlockMatrixQuery>(
    field: K,
    value: BlockMatrixQuery[K],
  ) => {
    if (isLocked(field)) return;
    if (field === 'source') {
      setQuery((prev) => ({ ...prev, source: 'primitives' }));
      return;
    }
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
      source: 'primitives',
      composition_role: undefined,
      kind: undefined,
    }));
  };

  const applySelectedPreset = () => {
    const selected =
      filteredPresetOptions.find((option) => option.key === selectedPresetKey)
      ?? filteredPresetOptions[0];
    if (!selected) return;
    applyPreset(selected.preset);
  };

  const selectedPresetOption =
    filteredPresetOptions.find((option) => option.key === selectedPresetKey)
    ?? filteredPresetOptions[0]
    ?? null;

  const allPresetSourcesSelected =
    presetSourceOptions.length > 0 && selectedPresetSources.length === presetSourceOptions.length;
  const presetFilterDefs = useMemo<ClientFilterDef<never>[]>(
    () => [
      {
        key: PRESET_SOURCE_FILTER_KEY,
        label: 'Sources',
        icon: 'sliders',
        type: 'enum',
        selectionMode: 'multi',
        order: 0,
        predicate: () => true,
      },
      {
        key: PRESET_SEARCH_FILTER_KEY,
        label: 'Preset Search',
        icon: 'search',
        type: 'search',
        order: 1,
        predicate: () => true,
      },
    ],
    [],
  );

  const presetFilterState = useMemo<Record<string, ClientFilterValue>>(
    () => ({
      [PRESET_SOURCE_FILTER_KEY]: allPresetSourcesSelected
        ? undefined
        : selectedPresetSources,
      [PRESET_SEARCH_FILTER_KEY]: presetFilter || undefined,
    }),
    [allPresetSourcesSelected, presetFilter, selectedPresetSources],
  );

  const presetDerivedOptions = useMemo(
    () => ({
      [PRESET_SOURCE_FILTER_KEY]: presetSourceOptions.map((source) => ({
        value: source,
        label: source,
      })),
    }),
    [presetSourceOptions],
  );

  const handlePresetFilterChange = useCallback(
    (key: string, value: ClientFilterValue) => {
      if (key === PRESET_SEARCH_FILTER_KEY) {
        setPresetFilter(typeof value === 'string' ? value : '');
        return;
      }
      if (key !== PRESET_SOURCE_FILTER_KEY) return;

      if (Array.isArray(value)) {
        const next = value
          .map(String)
          .filter((source) => presetSourceOptions.includes(source));
        setSelectedPresetSources(next.length > 0 ? next : [...presetSourceOptions]);
        return;
      }

      setSelectedPresetSources([...presetSourceOptions]);
    },
    [presetSourceOptions],
  );

  const resetPresetFilters = useCallback(() => {
    setPresetFilter('');
    setSelectedPresetSources([...presetSourceOptions]);
  }, [presetSourceOptions]);

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
          {!isLocked('package_name') && (
            <input
              type="text"
              value={query.package_name ?? ''}
              onChange={(e) => updateField('package_name', e.target.value || undefined)}
              placeholder="source pack"
              className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 w-24"
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
            <div className="min-w-0">
              <ClientFilterBar
                defs={presetFilterDefs}
                filterState={presetFilterState}
                derivedOptions={presetDerivedOptions}
                onFilterChange={handlePresetFilterChange}
                onReset={resetPresetFilters}
                popoverMode="inline"
              />
            </div>
            <select
              value={selectedPresetKey}
              onChange={(e) => setSelectedPresetKey(e.target.value)}
              className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-200 outline-none max-w-[360px]"
              title="Select matrix preset"
            >
              {filteredPresetOptions.length === 0 ? (
                <option value="">No matching presets</option>
              ) : (
                filteredPresetOptions.map(({ key, preset }) => (
                  <option key={key} value={key}>
                    {preset.label} [{preset.source ?? 'preset'}]
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={applySelectedPreset}
              disabled={filteredPresetOptions.length === 0}
              className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-50"
              title="Apply selected preset"
            >
              Apply
            </button>
            <span className="text-[10px] text-neutral-500">
              {filteredPresetOptions.length}/{sourceFilteredPresetOptions.length}/{presetOptions.length}
            </span>
            {selectedPresetOption && (
              <span
                className={clsx(
                  'px-1 py-0.5 rounded border text-[9px] uppercase tracking-wide',
                  presetSourceBadgeClass(selectedPresetOption.preset.source),
                )}
              >
                {selectedPresetOption.preset.source ?? 'preset'}
              </span>
            )}
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

      {/* Matrix grid + detail below */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Grid area */}
        <div className={clsx('flex-1 min-w-0 min-h-0 overflow-auto', selection && 'border-b border-neutral-800')}>
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
              selection={selection}
              onCellClick={handleCellClick}
              onRowClick={handleRowClick}
              onColClick={handleColClick}
              rowTotals={rowTotals}
              colTotals={colTotals}
              maxRowTotal={maxRowTotal}
              maxColTotal={maxColTotal}
              grandTotal={grandTotal}
            />
          )}
        </div>

        {/* Detail panel below matrix */}
        {selection && (
          <SelectionDetail
            selection={selection}
            cells={selectedCells}
            rowKey={data?.row_key ?? ''}
            colKey={data?.col_key ?? ''}
            onClose={() => setSelection(null)}
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

function isCellSelected(
  selection: MatrixSelection,
  row: string,
  col: string,
): boolean {
  if (!selection) return false;
  if (selection.kind === 'row') return selection.rowValue === row;
  if (selection.kind === 'col') return selection.colValue === col;
  if (selection.kind === 'cell') {
    return selection.cells.some((c) => c.row_value === row && c.col_value === col);
  }
  return false;
}

function MatrixGrid({
  data,
  cellMap,
  maxCount,
  selection,
  onCellClick,
  onRowClick,
  onColClick,
  rowTotals,
  colTotals,
  maxRowTotal,
  maxColTotal,
  grandTotal,
}: {
  data: BlockMatrixResponse;
  cellMap: Map<string, BlockMatrixCell>;
  maxCount: number;
  selection: MatrixSelection;
  onCellClick: (cell: BlockMatrixCell, ctrlKey: boolean) => void;
  onRowClick: (rowValue: string) => void;
  onColClick: (colValue: string) => void;
  rowTotals: Map<string, number>;
  colTotals: Map<string, number>;
  maxRowTotal: number;
  maxColTotal: number;
  grandTotal: number;
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
            {data.col_values.map((col) => {
              const total = colTotals.get(col) ?? 0;
              const barPct = maxColTotal > 0 ? (total / maxColTotal) * 100 : 0;
              const isColSelected = selection?.kind === 'col' && selection.colValue === col;
              return (
                <th
                  key={col}
                  onClick={() => onColClick(col)}
                  className={clsx(
                    'sticky top-0 z-10 bg-neutral-900 border-b border-neutral-700 px-2 py-1.5 text-center font-medium whitespace-nowrap cursor-pointer transition-colors',
                    isColSelected
                      ? 'text-blue-300 bg-blue-900/20'
                      : 'text-neutral-300 hover:bg-neutral-800/60',
                  )}
                  title={`${col} — total: ${total}`}
                >
                  <div>{col}</div>
                  {/* Distribution bar */}
                  <div className="mt-1 h-1 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500/50 transition-all"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </th>
              );
            })}
            {/* Totals column header */}
            <th className="sticky top-0 z-10 bg-neutral-900 border-b border-l border-neutral-700 px-2 py-1.5 text-center font-medium text-neutral-500 whitespace-nowrap text-[10px]">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.row_values.map((row) => {
            const rowTotal = rowTotals.get(row) ?? 0;
            const barPct = maxRowTotal > 0 ? (rowTotal / maxRowTotal) * 100 : 0;
            const isRowSelected = selection?.kind === 'row' && selection.rowValue === row;
            return (
              <tr key={row}>
                <td
                  onClick={() => onRowClick(row)}
                  className={clsx(
                    'sticky left-0 z-10 bg-neutral-900 border-r border-neutral-700 px-2 py-1 font-medium whitespace-nowrap cursor-pointer transition-colors',
                    isRowSelected
                      ? 'text-blue-300 bg-blue-900/20'
                      : 'text-neutral-300 hover:bg-neutral-800/60',
                  )}
                  title={`${row} — total: ${rowTotal}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1">{row}</span>
                    {/* Inline distribution bar */}
                    <div className="w-12 h-1 rounded-full bg-neutral-800 overflow-hidden shrink-0">
                      <div
                        className="h-full rounded-full bg-blue-500/50 transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                </td>
                {data.col_values.map((col) => {
                  const key = `${row}|${col}`;
                  const cell = cellMap.get(key);
                  const count = cell?.count ?? 0;
                  const selected = isCellSelected(selection, row, col);

                  return (
                    <td
                      key={col}
                      onClick={(e) => {
                        const c = cell ?? { row_value: row, col_value: col, count: 0, samples: [] };
                        onCellClick(c, e.ctrlKey || e.metaKey);
                      }}
                      className={clsx(
                        'px-2 py-1 text-center cursor-pointer transition-colors border border-neutral-800/50 tabular-nums min-w-[40px]',
                        heatmapClass(count, maxCount),
                        selected && 'ring-1 ring-blue-500 ring-inset',
                      )}
                      title={`${row} / ${col}: ${count}`}
                    >
                      {count > 0 ? count : <span className="text-neutral-700">-</span>}
                    </td>
                  );
                })}
                {/* Row total */}
                <td className="px-2 py-1 text-center border-l border-neutral-700 tabular-nums text-[10px] text-neutral-400 font-medium">
                  {rowTotal}
                </td>
              </tr>
            );
          })}
          {/* Totals row */}
          <tr>
            <td className="sticky left-0 z-10 bg-neutral-900 border-r border-t border-neutral-700 px-2 py-1 text-[10px] text-neutral-500 font-medium whitespace-nowrap">
              Total
            </td>
            {data.col_values.map((col) => {
              const total = colTotals.get(col) ?? 0;
              return (
                <td
                  key={col}
                  className="px-2 py-1 text-center border-t border-neutral-700 tabular-nums text-[10px] text-neutral-400 font-medium"
                >
                  {total}
                </td>
              );
            })}
            <td className="px-2 py-1 text-center border-t border-l border-neutral-700 tabular-nums text-[10px] text-neutral-300 font-semibold">
              {grandTotal}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Selection Detail Panel (below matrix) ───────────────────────────────

function SelectionDetail({
  selection,
  cells,
  rowKey,
  colKey,
  onClose,
  onOpenBlock,
}: {
  selection: NonNullable<MatrixSelection>;
  cells: BlockMatrixCell[];
  rowKey: string;
  colKey: string;
  onClose: () => void;
  onOpenBlock?: (blockId: string) => void;
}) {
  const totalCount = cells.reduce((sum, c) => sum + c.count, 0);
  const allSamples = cells.flatMap((c) => c.samples);

  // For row/col selection, show a mini breakdown bar chart
  const breakdown = selection.kind === 'row' || selection.kind === 'col'
    ? cells
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count)
    : null;
  const breakdownMax = breakdown ? Math.max(1, breakdown[0]?.count ?? 1) : 1;

  const titleLabel =
    selection.kind === 'row'
      ? `Row: ${selection.rowValue}`
      : selection.kind === 'col'
        ? `Column: ${selection.colValue}`
        : cells.length === 1
          ? 'Cell Detail'
          : `${cells.length} Cells`;

  return (
    <div className="shrink-0 max-h-[40%] overflow-y-auto px-3 py-2">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[11px] font-medium text-neutral-200">{titleLabel}</span>

        {/* Inline summary stats */}
        <div className="flex items-center gap-3 text-[10px]">
          {selection.kind === 'cell' && cells.length === 1 && (
            <>
              <span className="text-neutral-500">
                {rowKey}: <span className="text-neutral-300 font-mono">{cells[0].row_value}</span>
              </span>
              <span className="text-neutral-500">
                {colKey}: <span className="text-neutral-300 font-mono">{cells[0].col_value}</span>
              </span>
            </>
          )}
          {selection.kind === 'row' && (
            <span className="text-neutral-500">
              {rowKey}: <span className="text-neutral-300 font-mono">{selection.rowValue}</span>
            </span>
          )}
          {selection.kind === 'col' && (
            <span className="text-neutral-500">
              {colKey}: <span className="text-neutral-300 font-mono">{selection.colValue}</span>
            </span>
          )}
          <span className="text-neutral-500">
            Total: <span className="text-neutral-200 font-medium">{totalCount}</span>
          </span>
          {cells.length > 1 && (
            <span className="text-neutral-500">
              Cells: <span className="text-neutral-200">{cells.length}</span>
            </span>
          )}
        </div>

        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded text-neutral-500 hover:text-neutral-300"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {/* Content laid out horizontally */}
      <div className="flex gap-4 min-h-0">
        {/* Breakdown bar chart for row/col selection */}
        {breakdown && breakdown.length > 0 && (
          <div className="space-y-0.5 min-w-[180px] max-w-[280px] shrink-0">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
              Distribution
            </div>
            {breakdown.map((c) => {
              const label = selection.kind === 'row' ? c.col_value : c.row_value;
              const pct = (c.count / breakdownMax) * 100;
              return (
                <button
                  key={`${c.row_value}|${c.col_value}`}
                  type="button"
                  onClick={() => onOpenBlock?.(c.samples[0]?.block_id ?? '')}
                  disabled={!onOpenBlock || c.samples.length === 0}
                  className="w-full text-left group disabled:cursor-default"
                >
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-neutral-300 truncate flex-1">{label}</span>
                    <span className="text-neutral-500 tabular-nums ml-1">{c.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500/60 group-hover:bg-blue-400/70 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Samples — horizontal wrap grid */}
        {allSamples.length > 0 && (
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
              Samples ({allSamples.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {allSamples.map((s) => (
                <SampleRow key={s.id} sample={s} onOpen={onOpenBlock} />
              ))}
            </div>
          </div>
        )}

        {/* Empty cell hint */}
        {totalCount === 0 && selection.kind === 'cell' && cells.length === 1 && (
          <div className="text-[10px] text-amber-500/70 p-2 rounded border border-amber-800/30 bg-amber-900/10">
            No blocks in this cell. Consider adding blocks with {rowKey}={cells[0].row_value}, {colKey}={cells[0].col_value}.
          </div>
        )}
      </div>
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
      className="text-left p-1.5 rounded border border-neutral-700/50 hover:bg-neutral-800/50 disabled:cursor-default max-w-[220px]"
    >
      <div className="text-[10px] text-neutral-200 font-mono truncate">{sample.block_id}</div>
      <div className="text-[9px] text-neutral-500 truncate">
        {sample.category ?? 'no cat'}
        {sample.composition_role && ` | ${sample.composition_role}`}
        {sample.package_name && ` | ${sample.package_name}`}
      </div>
    </button>
  );
}
