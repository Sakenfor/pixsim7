import { Dropdown } from '@pixsim7/shared.ui';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';

import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import type { AssetFilters } from '../hooks/useAssets';
import { useFilterMetadata } from '../hooks/useFilterMetadata';
import type { FilterDefinition, FilterMetadataResponse, FilterOptionValue } from '../lib/api';
import { useCollapsedGroupsStore } from '../stores/collapsedGroupsStore';
import { usePinnedFiltersStore } from '../stores/pinnedFiltersStore';
import { useRecordSearchHistory } from '../stores/searchHistoryStore';

import { SearchHistoryList } from './SearchHistoryList';

/**
 * UI-specific metadata for filter keys.
 * Frontend owns display concerns (icons, order, labels override).
 */
const FILTER_UI_CONFIG: Record<string, { icon?: string; order?: number; overflow?: boolean; label?: string }> = {
  q: { icon: 'search', order: 0 },
  media_type: { icon: 'video', order: 1 },
  provider_id: { icon: 'globe', order: 2, label: 'Provider' },
  effective_provider_id: { icon: 'globe', order: 2, label: 'Provider' },
  operation_type: { icon: 'wand', order: 2 },
  model: { icon: 'cpu', order: 2, label: 'Model' },
  prompt_success_rate: { icon: 'gauge', order: 2, label: 'Prompt success' },
  tag: { icon: 'tag', order: 3 },
  content_elements: { icon: 'layers', order: 4 },
  style_tags: { icon: 'sparkles', order: 5 },
  upload_method: { icon: 'upload', order: 5 },
  // Upload-context-derived filters (shown when relevant upload_method is active)
  mask_type: { icon: 'paintbrush', order: 6 },
  source_asset_id: { icon: 'link', order: 6 },
  source_site: { icon: 'globe', order: 7 },
  source_path: { icon: 'folderTree', order: 7 },
  source_filename: { icon: 'video', order: 7 },
  source_folder_id: { icon: 'folder', order: 7 },
  source_relative_path: { icon: 'folderTree', order: 7 },
  source_url: { icon: 'externalLink', order: 7 },
  // Overflow: shown in the "more" menu instead of the main bar
  missing_prompt: { icon: 'fileQuestion', order: 80, overflow: true },
  missing_analysis: { icon: 'analysis', order: 81, overflow: true },
  missing_embedding: { icon: 'eye', order: 82, overflow: true },
  missing_tags: { icon: 'tags', order: 83, overflow: true },
  signal_likely_broken: { icon: 'alertTriangle', order: 84, overflow: true },
  signal_likely_clean: { icon: 'checkCircle', order: 85, overflow: true },
  include_archived: { icon: 'archive', order: 90, overflow: true },
  provider_status: { icon: 'shield', order: 91, overflow: true },
};

/** Filters whose options are grouped into collapsible namespaces. */
const GROUPED_FILTER_CONFIG: Record<string, {
  separator: string;
  ungroupedKey?: string;
  rootLabel?: string;
}> = {
  tag:              { separator: ':', ungroupedKey: 'other' },
  model:            { separator: ':', ungroupedKey: 'other' },
  content_elements: { separator: ':', ungroupedKey: 'other' },
  style_tags:       { separator: ':', ungroupedKey: 'other' },
  source_path:     { separator: '/', rootLabel: '(root)' },
  source_filename: { separator: '/', rootLabel: '(root)', ungroupedKey: 'other' },
};

/** Slider config for `range`-type filters (single min-threshold thumb). */
const RANGE_FILTER_CONFIG: Record<string, {
  min: number;
  max: number;
  step: number;
  unit?: string;
}> = {
  prompt_success_rate: { min: 0, max: 100, step: 5, unit: '%' },
};

const NULLISH_OPTION_TOKENS = new Set(['null', '(null)', 'undefined', '(undefined)']);
const FILTER_KEY_ALIASES: Record<string, string> = {
  provider_id: 'effective_provider_id',
};

function normalizeOptionText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (NULLISH_OPTION_TOKENS.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function getOptionDisplayLabel(opt: Pick<FilterOptionValue, 'label' | 'value'>): string {
  return normalizeOptionText(opt.label) ?? normalizeOptionText(opt.value) ?? 'Unknown';
}

/**
 * Group filter options by namespace parsed from a separator character.
 * @param separator  Character to split on (default `':'`)
 * @param ungroupedKey  Key for items without separator. `undefined` = use value itself as group key.
 */
function groupOptionsByNamespace(
  options: FilterOptionValue[],
  separator: string = ':',
  ungroupedKey: string | undefined = 'other',
): Map<string, FilterOptionValue[]> {
  const groups = new Map<string, FilterOptionValue[]>();

  for (const opt of options) {
    const sepIdx = opt.value.indexOf(separator);
    const namespace =
      sepIdx > 0
        ? opt.value.substring(0, sepIdx)
        : ungroupedKey !== undefined
          ? ungroupedKey
          : opt.value;

    let group = groups.get(namespace);
    if (!group) {
      group = [];
      groups.set(namespace, group);
    }
    group.push(opt);
  }

  return groups;
}

interface DynamicFiltersProps {
  filters: AssetFilters;
  onFiltersChange: (filters: AssetFilters) => void;
  /** Which filter keys to show (if not provided, shows all) */
  include?: string[];
  /** Which filter keys to hide */
  exclude?: string[];
  /** Show counts in options */
  showCounts?: boolean;
  /** Compact mode (icons only) */
  compact?: boolean;
  /** Extra chip elements rendered after primary filters and before the overflow menu */
  extraChips?: ReactNode;
  /** Called when the user picks "Browse in gallery" from a chip's context menu. */
  onBrowseFilter?: (filterKey: string, currentFilters: AssetFilters) => void;
}

/**
 * Dynamic filter bar that renders controls based on backend metadata.
 * Supports enum dropdowns, boolean toggles, and search inputs.
 */
export function DynamicFilters({
  filters,
  onFiltersChange,
  include,
  exclude = [],
  showCounts = false,
  compact = false,
  extraChips,
  onBrowseFilter,
}: DynamicFiltersProps) {
  const [openFilters, setOpenFilters] = useState<Set<string>>(new Set());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [chipMenu, setChipMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const hoverTimeoutRef = useRef<number | null>(null);
  const filterContext = useMemo(() => {
    if (!filters.upload_method) {
      return undefined;
    }
    return { upload_method: filters.upload_method };
  }, [filters.upload_method]);

  const { metadata, loading, error } = useFilterMetadata({
    includeCounts: showCounts,
    context: filterContext,
    limit: 150,
  });

  const pinnedKeys = usePinnedFiltersStore((s) => s.pinnedKeys);
  const togglePin = usePinnedFiltersStore((s) => s.togglePin);

  const readFilterValue = useCallback(
    (key: string): string | boolean | number | string[] | undefined => {
      if (key === 'effective_provider_id') {
        return (filters.effective_provider_id ?? filters.provider_id) as string | boolean | number | string[] | undefined;
      }
      if (key === 'effective_provider_id__mode') {
        return (filters.effective_provider_id__mode ?? filters.provider_id__mode) as string | boolean | number | string[] | undefined;
      }
      return filters[key as keyof AssetFilters] as string | boolean | number | string[] | undefined;
    },
    [filters],
  );

  // Sort and split into primary bar vs overflow menu
  const { primaryFilters, overflowFilters } = useMemo(() => {
    if (!metadata) return { primaryFilters: [], overflowFilters: [] };
    const availableKeys = new Set(metadata.filters.map((f) => f.key));

    const hasActiveSelection = (key: string) => {
      const val = readFilterValue(key);
      if (val === undefined || val === null || val === '' || val === false) return false;
      if (Array.isArray(val)) return val.length > 0;
      return true;
    };

    const all = metadata.filters
      .filter((f) => {
        const canonicalKey = FILTER_KEY_ALIASES[f.key];
        if (canonicalKey && availableKeys.has(canonicalKey)) return false;
        if (include && !include.includes(f.key)) return false;
        if (exclude.includes(f.key)) return false;
        return true;
      })
      .sort((a, b) => {
        const pinA = pinnedKeys.includes(a.key);
        const pinB = pinnedKeys.includes(b.key);
        const activeA = hasActiveSelection(a.key);
        const activeB = hasActiveSelection(b.key);
        const scoreA = (pinA ? 2 : 0) + (activeA ? 1 : 0);
        const scoreB = (pinB ? 2 : 0) + (activeB ? 1 : 0);
        if (scoreA !== scoreB) return scoreB - scoreA;
        const orderA = FILTER_UI_CONFIG[a.key]?.order ?? 99;
        const orderB = FILTER_UI_CONFIG[b.key]?.order ?? 99;
        return orderA - orderB;
      });

    const primary: FilterDefinition[] = [];
    const overflow: FilterDefinition[] = [];
    for (const f of all) {
      if (FILTER_UI_CONFIG[f.key]?.overflow) {
        overflow.push(f);
      } else {
        primary.push(f);
      }
    }
    return { primaryFilters: primary, overflowFilters: overflow };
  }, [metadata, include, exclude, pinnedKeys, readFilterValue]);

  const handleFilterChange = useCallback(
    (key: string, value: string | boolean | number | string[] | undefined) => {
      const normalized = Array.isArray(value)
        ? value.length > 0
          ? value
          : undefined
        : value === ''
          ? undefined
          : value;
      const nextFilters = {
        ...filters,
        [key]: normalized,
      };
      // Keep one provider key active in UI/state to avoid duplicate provider chips.
      if (key === 'effective_provider_id' || key === 'effective_provider_id__mode') {
        nextFilters.provider_id = undefined;
        nextFilters.provider_id__mode = undefined;
      }
      onFiltersChange(nextFilters);
    },
    [filters, onFiltersChange]
  );

  const setTriggerRef = useCallback(
    (key: string) => (node: HTMLButtonElement | null) => {
      if (node) {
        triggerRefs.current.set(key, node);
      } else {
        triggerRefs.current.delete(key);
      }
    },
    []
  );

  const openHover = useCallback((key: string) => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredKey(key);
  }, []);

  const closeHover = useCallback((key: string) => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredKey((prev) => (prev === key ? null : prev));
    }, 120);
  }, []);

  const openMiniGalleryForChip = useCallback(
    (filterKey: string, anchor: HTMLElement | null, sourceLabel: string) => {
      const value = readFilterValue(filterKey);
      if (value === undefined || value === null || value === '' || value === false) return;
      if (Array.isArray(value) && value.length === 0) return;
      const initialFilters: AssetFilters = { [filterKey]: value } as AssetFilters;
      const rect = anchor?.getBoundingClientRect();
      useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
        context: { initialFilters, sourceLabel, suppressHoverActions: true },
        x: rect ? rect.right + 8 : undefined,
        y: rect ? rect.top : undefined,
      });
    },
    [readFilterValue],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <Icon name="loader" className="animate-spin w-4 h-4" />
        Loading filters...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500">
        Filters unavailable: {error}
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="text-sm text-neutral-500 dark:text-neutral-400">
        Filters unavailable.
      </div>
    );
  }

  if (primaryFilters.length === 0 && overflowFilters.length === 0) {
    return (
      <div className="text-sm text-neutral-500 dark:text-neutral-400">
        No filters available.
      </div>
    );
  }

  const hasOverflowSelection = overflowFilters.some((f) => {
    const val = filters[f.key as keyof AssetFilters];
    return val !== undefined && val !== null && val !== '' && val !== false;
  });

  return (
    <div className="relative flex flex-nowrap items-start gap-1.5 w-full overflow-x-auto overflow-y-visible pb-1">
      {primaryFilters.map((filter) => {
        const isOpen = openFilters.has(filter.key);
        const isHovered = hoveredKey === filter.key;
        const isVisible = isOpen || isHovered;
        const selectedValue = readFilterValue(filter.key);
        const selectedCount = Array.isArray(selectedValue)
          ? selectedValue.length
          : selectedValue
            ? 1
            : 0;
        const hasSelection = selectedCount > 0;
        const uiConfig = FILTER_UI_CONFIG[filter.key] || {};
        const resolvedIcon = uiConfig.icon ?? 'sliders';
        const displayLabel =
          uiConfig.label ||
          filter.label ||
          filter.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        const isPinned = pinnedKeys.includes(filter.key);
        const isInFlow = hasSelection || isOpen || isPinned;

        return (
          <div
            key={filter.key}
            className={`relative group flex-none ${isInFlow ? '' : 'w-7 h-7'}`}
            style={!isInFlow && isVisible ? { zIndex: 30 } : undefined}
            onMouseEnter={() => openHover(filter.key)}
            onMouseLeave={() => closeHover(filter.key)}
            onContextMenu={(e) => {
              e.preventDefault();
              setChipMenu({ key: filter.key, x: e.clientX, y: e.clientY });
            }}
          >
            <button
              type="button"
              title={displayLabel}
              aria-expanded={isOpen}
              ref={setTriggerRef(filter.key)}
              onClick={() =>
                setOpenFilters((prev) => {
                  const next = new Set(prev);
                  if (next.has(filter.key)) {
                    next.delete(filter.key);
                  } else {
                    next.add(filter.key);
                  }
                  return next;
                })
              }
              className={`${isInFlow ? 'relative' : 'absolute left-0 top-0 w-7 justify-center'} z-20 inline-flex items-center gap-1.5 h-7 px-1.5 rounded border text-xs transition-[background-color,border-color] duration-200 ${
                hasSelection
                  ? 'border-accent/50 bg-accent/10 text-neutral-800 dark:text-neutral-100'
                  : isOpen
                    ? 'border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
            >
              <span className="relative flex-shrink-0">
                <Icon
                  name={resolvedIcon}
                  size={14}
                  className="w-3.5 h-3.5"
                />
                {hasSelection && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] leading-none px-0.5 min-w-[12px] text-center rounded-full bg-accent text-accent-text">
                    {selectedCount}
                  </span>
                )}
              </span>
              {isInFlow && (
                <span className="font-medium whitespace-nowrap">
                  {displayLabel}
                </span>
              )}
              {isInFlow && isPinned && (
                <span className="flex-shrink-0 text-accent">
                  <Icon name="pin" size={10} className="w-2.5 h-2.5" />
                </span>
              )}
            </button>
            {hasSelection && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openMiniGalleryForChip(
                    filter.key,
                    triggerRefs.current.get(filter.key) ?? null,
                    displayLabel,
                  );
                }}
                title={`Open ${displayLabel} in Mini Gallery`}
                aria-label={`Open ${displayLabel} in Mini Gallery`}
                tabIndex={isVisible ? 0 : -1}
                className={`relative z-20 inline-flex items-center justify-center h-7 rounded border text-xs overflow-hidden transition-[width,opacity,margin,border-color,background-color] duration-200 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-accent ${
                  isVisible
                    ? 'w-7 ml-1 opacity-100'
                    : 'w-0 ml-0 opacity-0 pointer-events-none border-transparent'
                }`}
              >
                <Icon name="externalLink" size={12} className="w-3 h-3" />
              </button>
            )}
            {/* Floating label — pointer-events-none so the mouse passes through to neighbors */}
            {!isInFlow && (
              <span
                className={`absolute left-[27px] top-0 z-20 h-7 inline-flex items-center gap-1 pl-1 pr-1.5 rounded-r border border-l-0 text-xs font-medium whitespace-nowrap pointer-events-none transition-opacity duration-150 text-neutral-700 dark:text-neutral-200 ${
                  isVisible
                    ? 'opacity-100 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900'
                    : 'opacity-0 border-transparent'
                }`}
              >
                {displayLabel}
                {isPinned && (
                  <span className="text-accent">
                    <Icon name="pin" size={10} className="w-2.5 h-2.5" />
                  </span>
                )}
              </span>
            )}
            <FilterDropdown
              anchorEl={triggerRefs.current.get(filter.key) || null}
              visible={isVisible}
              onClose={() => {
                setOpenFilters((prev) => {
                  if (!prev.has(filter.key)) return prev;
                  const next = new Set(prev);
                  next.delete(filter.key);
                  return next;
                });
                setHoveredKey((prev) => (prev === filter.key ? null : prev));
              }}
              onMouseEnter={() => openHover(filter.key)}
              onMouseLeave={() => closeHover(filter.key)}
            >
              <FilterControl
                definition={filter}
                options={
                  filter.key === 'effective_provider_id'
                    ? (metadata.options.effective_provider_id || metadata.options.provider_id || [])
                    : (metadata.options[filter.key] || [])
                }
                value={readFilterValue(filter.key)}
                onChange={(value) => handleFilterChange(filter.key, value)}
                matchModes={filter.match_modes}
                mode={readFilterValue(`${filter.key}__mode`) as string | undefined}
                onModeChange={(mode) => handleFilterChange(`${filter.key}__mode`, mode)}
                compact={compact}
              />
            </FilterDropdown>
          </div>
        );
      })}
      {extraChips}
      {overflowFilters.length > 0 && (
        <OverflowMenu
          filters={overflowFilters}
          metadata={metadata}
          values={filters}
          onChange={handleFilterChange}
          hasSelection={hasOverflowSelection}
        />
      )}
      {chipMenu && createPortal(
        <ChipContextMenu
          x={chipMenu.x}
          y={chipMenu.y}
          isPinned={pinnedKeys.includes(chipMenu.key)}
          onTogglePin={() => { togglePin(chipMenu.key); setChipMenu(null); }}
          onBrowse={onBrowseFilter ? () => { onBrowseFilter(chipMenu.key, filters); setChipMenu(null); } : undefined}
          onClose={() => setChipMenu(null)}
        />,
        document.body,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chip right-click context menu
// ---------------------------------------------------------------------------

export function ChipContextMenu({
  x,
  y,
  isPinned,
  onTogglePin,
  onBrowse,
  onClose,
}: {
  x: number;
  y: number;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onBrowse?: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  // Clamp to viewport
  const left = Math.min(x, window.innerWidth - 180);
  const top = Math.min(y, window.innerHeight - 120);

  return (
    <div
      ref={menuRef}
      className="fixed z-popover min-w-[160px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl py-1"
      style={{ left, top }}
    >
      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <Icon name="pin" size={14} className="w-3.5 h-3.5" />
          <span>{isPinned ? 'Unpin filter' : 'Pin filter'}</span>
        </button>
      )}
      {onBrowse && (
        <button
          type="button"
          onClick={onBrowse}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <Icon name="image" size={14} className="w-3.5 h-3.5" />
          <span>Browse in gallery</span>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible group for namespaced tag options
// ---------------------------------------------------------------------------

function CollapsibleGroup({
  filterKey,
  groupKey,
  label,
  showHeader,
  selectedCount,
  totalCount,
  onToggleAll,
  onBrowseAll,
  children,
}: {
  filterKey: string;
  groupKey: string;
  label: string;
  showHeader: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleAll?: () => void;
  onBrowseAll?: (anchor: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const collapsed = useCollapsedGroupsStore((s) => s.isCollapsed(filterKey, groupKey));
  const toggle = useCollapsedGroupsStore((s) => s.toggle);
  const setCollapsed = () => toggle(filterKey, groupKey);
  const checkboxRef = useRef<HTMLInputElement>(null);

  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const someSelected = selectedCount > 0 && selectedCount < totalCount;

  // sync indeterminate (can't set via JSX attribute)
  useLayoutEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  if (!showHeader) {
    return <div className="flex flex-col gap-1">{children}</div>;
  }

  return (
    <div>
      <div className="group/header flex items-center gap-1 sticky top-0 bg-white/95 dark:bg-neutral-900/95">
        {onToggleAll && (
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="accent-accent ml-0.5 flex-shrink-0 cursor-pointer"
          />
        )}
        <button
          type="button"
          onClick={setCollapsed}
          className="flex items-center gap-1 flex-1 min-w-0 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold px-1 py-1 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
        >
          <Icon
            name="chevronRight"
            size={10}
            className={`w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
          />
          <span className="flex-1 text-left truncate">{label}</span>
          {selectedCount > 0 && (
            <span className="text-[9px] px-1 rounded-full bg-accent/20 text-accent not-uppercase normal-case font-normal flex-shrink-0">
              {selectedCount}
            </span>
          )}
        </button>
        {onBrowseAll && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onBrowseAll(e.currentTarget as HTMLElement);
            }}
            title={`Open all of "${label}" in Mini Gallery`}
            aria-label={`Open all of "${label}" in Mini Gallery`}
            className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 mr-0.5 rounded text-accent bg-accent/10 hover:bg-accent/25 hover:scale-110 opacity-0 group-hover/header:opacity-100 transition-[opacity,transform,background-color] duration-150"
          >
            <Icon name="externalLink" size={12} className="w-3 h-3" />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-1 pl-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enum filter sub-components (search + grouped / flat)
// ---------------------------------------------------------------------------

const SEARCH_THRESHOLD = 10;

/** Presentable label for a group key (e.g. "other" → "Other") */
function formatGroupLabel(key: string): string {
  if (key === 'other') return 'Other';
  const normalized = normalizeOptionText(key);
  if (!normalized) return 'Unknown';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function GroupedEnumFilter({
  filterKey,
  groupCfg,
  options,
  selectedValues,
  onChange,
  renderOption,
  renderMatchModeToggle,
}: {
  filterKey: string;
  groupCfg: { separator: string; ungroupedKey?: string; rootLabel?: string };
  options: FilterOptionValue[];
  selectedValues: string[];
  onChange: (value: string | boolean | number | string[] | undefined) => void;
  renderOption: (opt: FilterOptionValue, stripNamespace: boolean) => ReactNode;
  renderMatchModeToggle: () => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const showSearch = options.length >= SEARCH_THRESHOLD;
  const needle = search.toLowerCase();

  const filtered = useMemo(() => {
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(needle) ||
        (o.label && o.label.toLowerCase().includes(needle)),
    );
  }, [options, needle]);

  const grouped = useMemo(
    () => groupOptionsByNamespace(filtered, groupCfg.separator, groupCfg.ungroupedKey),
    [filtered, groupCfg.separator, groupCfg.ungroupedKey],
  );
  const groups = useMemo(() => Array.from(grouped.entries()), [grouped]);
  const showHeaders = groups.length > 1;

  const toggleGroup = useCallback(
    (groupValues: string[]) => {
      const allSelected = groupValues.every((v) => selectedValues.includes(v));
      if (allSelected) {
        const drop = new Set(groupValues);
        onChange(selectedValues.filter((v) => !drop.has(v)));
      } else {
        const combined = new Set([...selectedValues, ...groupValues]);
        onChange(Array.from(combined));
      }
    },
    [selectedValues, onChange],
  );

  return (
    <div className="space-y-2">
      {renderMatchModeToggle()}
      {showSearch && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter..."
          className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-accent"
        />
      )}
      <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto">
        {groups.length === 0 && search && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 px-1">No matches.</div>
        )}
        {groups.map(([namespace, nsOptions]) => {
          const groupValues = nsOptions.map((o) => String(o.value));
          const selectedInGroup = nsOptions.filter((o) =>
            selectedValues.includes(String(o.value)),
          ).length;
          const groupLabel = formatGroupLabel(namespace);
          return (
            <CollapsibleGroup
              key={namespace}
              filterKey={filterKey}
              groupKey={namespace}
              label={groupLabel}
              showHeader={showHeaders}
              selectedCount={selectedInGroup}
              totalCount={nsOptions.length}
              onToggleAll={showHeaders ? () => toggleGroup(groupValues) : undefined}
              onBrowseAll={
                showHeaders
                  ? (anchor) => {
                      const rect = anchor?.getBoundingClientRect();
                      useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
                        context: {
                          initialFilters: { [filterKey]: groupValues } as AssetFilters,
                          sourceLabel: groupLabel,
                          suppressHoverActions: true,
                        },
                        x: rect ? rect.right + 8 : undefined,
                        y: rect ? rect.top : undefined,
                      });
                    }
                  : undefined
              }
            >
              {nsOptions.map((opt) => renderOption(opt, showHeaders))}
            </CollapsibleGroup>
          );
        })}
      </div>
    </div>
  );
}

function FlatEnumFilter({
  options,
  renderOption,
  renderMatchModeToggle,
}: {
  options: FilterOptionValue[];
  selectedValues: string[];
  renderOption: (opt: FilterOptionValue, stripNamespace: boolean) => ReactNode;
  renderMatchModeToggle: () => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const showSearch = options.length >= SEARCH_THRESHOLD;
  const needle = search.toLowerCase();

  const filtered = useMemo(() => {
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(needle) ||
        (o.label && o.label.toLowerCase().includes(needle)),
    );
  }, [options, needle]);

  return (
    <div className="space-y-2">
      {renderMatchModeToggle()}
      {showSearch && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter..."
          className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-accent"
        />
      )}
      <div className="flex flex-col gap-1">
        {filtered.length === 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {search ? 'No matches.' : 'No options available.'}
          </div>
        )}
        {filtered.map((opt) => renderOption(opt, false))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overflow "more" menu — renders boolean toggles & secondary filters
// ---------------------------------------------------------------------------

interface OverflowMenuProps {
  filters: FilterDefinition[];
  metadata: FilterMetadataResponse;
  values: AssetFilters;
  onChange: (key: string, value: string | boolean | number | string[] | undefined) => void;
  hasSelection: boolean;
}

function OverflowMenu({ filters, metadata, values, onChange, hasSelection }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setRect(null);
      return;
    }
    const update = () => setRect(anchorRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  return (
    <div className="relative flex-none">
      <button
        ref={anchorRef}
        type="button"
        title="More filters"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center justify-center h-7 w-7 rounded border text-xs transition-colors ${
          hasSelection
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        }`}
      >
        <Icon name="moreHorizontal" size={14} className="w-3.5 h-3.5" />
      </button>
      {open && rect && createPortal(
        <div
          className="z-popover"
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 240 - 8)),
            top: rect.bottom + 6,
          }}
        >
          <Dropdown
            isOpen={open}
            onClose={() => setOpen(false)}
            positionMode="static"
            minWidth="200px"
            className="max-w-[280px]"
          >
            <div className="space-y-2">
              {filters.map((filter) => {
                const uiConfig = FILTER_UI_CONFIG[filter.key] || {};
                const displayLabel =
                  uiConfig.label ||
                  filter.label ||
                  filter.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                const val = values[filter.key as keyof AssetFilters];

                if (filter.type === 'boolean') {
                  return (
                    <div key={filter.key} className="group/ofrow flex items-center gap-1">
                      <label
                        className="flex items-center gap-2 px-1 py-0.5 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer flex-1 min-w-0"
                      >
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={(e) => onChange(filter.key, e.target.checked ? true : undefined)}
                          className="accent-accent flex-shrink-0"
                        />
                        {uiConfig.icon && <Icon name={uiConfig.icon} size={14} className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 flex-shrink-0" />}
                        <span className="truncate">{displayLabel}</span>
                      </label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
                            context: {
                              initialFilters: { [filter.key]: true } as AssetFilters,
                              sourceLabel: displayLabel,
                              suppressHoverActions: true,
                            },
                            x: rect.right + 8,
                            y: rect.top,
                          });
                        }}
                        title={`Open "${displayLabel}" in Mini Gallery`}
                        aria-label={`Open "${displayLabel}" in Mini Gallery`}
                        className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-accent bg-accent/10 hover:bg-accent/25 hover:scale-110 opacity-0 group-hover/ofrow:opacity-100 transition-[opacity,transform,background-color] duration-150"
                      >
                        <Icon name="externalLink" size={12} className="w-3 h-3" />
                      </button>
                    </div>
                  );
                }

                // Enum overflow filters (e.g. provider_status)
                if (filter.type === 'enum') {
                  const optionsByKey = metadata.options as unknown as Record<string, FilterOptionValue[]>;
                  const options = optionsByKey?.[filter.key] || [];
                  const selectedValues = Array.isArray(val) ? val.map(String) : val ? [String(val)] : [];
                  return (
                    <div key={filter.key} className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold px-1">
                        {uiConfig.icon && <Icon name={uiConfig.icon} size={12} className="w-3 h-3" />}
                        {displayLabel}
                      </div>
                      {options.map((opt) => {
                        const optValue = String(opt.value);
                        const isSelected = selectedValues.includes(optValue);
                        const optLabel = getOptionDisplayLabel(opt);
                        return (
                          <div key={opt.value} className="group/ofopt flex items-center gap-1">
                            <label
                              className="flex items-center gap-2 px-1 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer flex-1 min-w-0"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  const next = new Set(selectedValues);
                                  if (next.has(optValue)) next.delete(optValue);
                                  else next.add(optValue);
                                  onChange(filter.key, Array.from(next));
                                }}
                                className="accent-accent flex-shrink-0"
                              />
                              <span className="truncate">{optLabel}</span>
                            </label>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
                                  context: {
                                    initialFilters: { [filter.key]: [optValue] } as AssetFilters,
                                    sourceLabel: optLabel,
                                    suppressHoverActions: true,
                                  },
                                  x: rect.right + 8,
                                  y: rect.top,
                                });
                              }}
                              title={`Open "${optLabel}" in Mini Gallery`}
                              aria-label={`Open "${optLabel}" in Mini Gallery`}
                              className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-accent bg-accent/10 hover:bg-accent/25 hover:scale-110 opacity-0 group-hover/ofopt:opacity-100 transition-[opacity,transform,background-color] duration-150"
                            >
                              <Icon name="externalLink" size={12} className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </Dropdown>
        </div>,
        document.body
      )}
    </div>
  );
}

interface FilterDropdownProps {
  anchorEl: HTMLElement | null;
  visible: boolean;
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: ReactNode;
}

function FilterDropdown({
  anchorEl,
  visible,
  onClose,
  onMouseEnter,
  onMouseLeave,
  children,
}: FilterDropdownProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!visible || !anchorEl) {
      setRect(null);
      return;
    }

    const update = () => {
      setRect(anchorEl.getBoundingClientRect());
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [visible, anchorEl]);

  if (!visible || !rect) {
    return null;
  }

  const spacing = 8;
  const minWidth = 220;
  const maxWidth = 360;
  const width = Math.min(maxWidth, Math.max(minWidth, rect.width));
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const top = rect.bottom + spacing;

  return createPortal(
    <div
      className="z-popover"
      style={{
        position: 'fixed',
        left,
        top,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Dropdown
        isOpen={visible}
        onClose={onClose || (() => undefined)}
        positionMode="static"
        minWidth={`${width}px`}
        className="max-w-[360px]"
      >
        {children}
      </Dropdown>
    </div>,
    document.body
  );
}

interface FilterControlProps {
  definition: FilterDefinition;
  options: FilterOptionValue[];
  value: string | boolean | number | string[] | undefined | null;
  onChange: (value: string | boolean | number | string[] | undefined) => void;
  matchModes?: string[];
  mode?: string;
  onModeChange?: (mode: string) => void;
  compact?: boolean;
}

function FilterControl({
  definition,
  options,
  value,
  onChange,
  matchModes,
  mode,
  onModeChange,
  compact,
}: FilterControlProps) {
  const { key, type, label } = definition;
  const uiConfig = FILTER_UI_CONFIG[key] || {};
  const displayLabel = label || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const selectedValues = useMemo(() => {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry));
    }
    if (value === undefined || value === null || value === '') {
      return [];
    }
    return [String(value)];
  }, [value]);
  const normalizedMode = useMemo(() => {
    if (!matchModes || matchModes.length === 0) return undefined;
    if (mode && matchModes.includes(mode)) return mode;
    if (matchModes.includes('any')) return 'any';
    return matchModes[0];
  }, [matchModes, mode]);

  const renderMatchModeToggle = () => {
    if (!matchModes || matchModes.length === 0 || !onModeChange) {
      return null;
    }
    const options = matchModes;
    return (
      <div className="flex items-center gap-1">
        {options.map((entry) => {
          const active = normalizedMode === entry;
          return (
            <button
              key={entry}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onModeChange(entry);
              }}
              className={`px-2 py-0.5 text-[10px] uppercase tracking-wide border rounded transition-colors ${
                active
                  ? 'bg-accent/40 border-accent-muted text-accent-text'
                  : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {entry}
            </button>
          );
        })}
      </div>
    );
  };

  switch (type) {
    case 'search': {
      return (
        <SearchFilterControl
          filterKey={key}
          value={typeof value === 'string' ? value : undefined}
          icon={uiConfig.icon}
          displayLabel={displayLabel}
          compact={compact}
          onChange={onChange}
          renderMatchModeToggle={renderMatchModeToggle}
        />
      );
    }

    case 'enum': {
      const groupCfg = GROUPED_FILTER_CONFIG[key];
      const shouldGroup = !!groupCfg && options.length > 0;
      const groupSeparator = groupCfg?.separator ?? ':';

      const renderOption = (opt: FilterOptionValue, stripNamespace: boolean) => {
        const optValue = String(opt.value);
        const isSelected = selectedValues.includes(optValue);
        let displayLabel: string;
        if (stripNamespace) {
          const parts = opt.value.split(groupSeparator);
          if (parts.length > 1) {
            // Has separator: strip namespace prefix, show the rest
            const afterSep = normalizeOptionText(parts.slice(1).join(groupSeparator));
            displayLabel = afterSep || (groupCfg?.rootLabel ?? getOptionDisplayLabel(opt));
          } else {
            // No separator found: show the original value (e.g. bare filename)
            displayLabel = getOptionDisplayLabel(opt);
          }
        } else {
          displayLabel = getOptionDisplayLabel(opt);
        }
        return (
          <div
            key={opt.value}
            className="group/opt flex items-center gap-1"
          >
            <label
              className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer flex-1 min-w-0"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {
                  const next = new Set(selectedValues);
                  if (next.has(optValue)) {
                    next.delete(optValue);
                  } else {
                    next.add(optValue);
                  }
                  onChange(Array.from(next));
                }}
                className="accent-accent flex-shrink-0"
              />
              <span className="truncate">
                {displayLabel}
                {opt.count !== undefined ? ` (${opt.count})` : ''}
              </span>
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
                  context: {
                    initialFilters: { [key]: [optValue] } as AssetFilters,
                    sourceLabel: displayLabel,
                    suppressHoverActions: true,
                  },
                  x: rect.right + 8,
                  y: rect.top,
                });
              }}
              title={`Open "${displayLabel}" in Mini Gallery`}
              aria-label={`Open "${displayLabel}" in Mini Gallery`}
              className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-accent bg-accent/10 hover:bg-accent/25 hover:scale-110 opacity-0 group-hover/opt:opacity-100 transition-[opacity,transform,background-color] duration-150"
            >
              <Icon name="externalLink" size={12} className="w-3 h-3" />
            </button>
          </div>
        );
      };

      if (shouldGroup) {
        return (
          <GroupedEnumFilter
            filterKey={key}
            groupCfg={groupCfg!}
            options={options}
            selectedValues={selectedValues}
            onChange={onChange}
            renderOption={renderOption}
            renderMatchModeToggle={renderMatchModeToggle}
          />
        );
      }

      return (
        <FlatEnumFilter
          options={options}
          selectedValues={selectedValues}
          renderOption={renderOption}
          renderMatchModeToggle={renderMatchModeToggle}
        />
      );
    }

    case 'boolean':
      return (
        <label
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-colors
            ${value ? 'bg-accent/20 border-accent/50 text-neutral-800 dark:text-neutral-100' : 'bg-white dark:bg-neutral-900/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}
            border text-sm
          `}
        >
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked ? true : undefined)}
            className="sr-only"
          />
          {uiConfig.icon && <Icon name={uiConfig.icon} className="w-4 h-4" />}
          {!compact && <span>{displayLabel}</span>}
        </label>
      );

    case 'range': {
      const cfg = RANGE_FILTER_CONFIG[key] ?? { min: 0, max: 100, step: 1 };
      const raw =
        typeof value === 'number'
          ? value
          : value != null && value !== '' && value !== false
            ? Number(value)
            : cfg.min;
      const current = Number.isFinite(raw) ? (raw as number) : cfg.min;
      return (
        <RangeFilterControl
          min={cfg.min}
          max={cfg.max}
          step={cfg.step}
          unit={cfg.unit}
          value={current}
          displayLabel={displayLabel}
          // At/below the floor the filter is a no-op → clear it so the chip
          // reads inactive and the key drops out of the search request.
          onChange={(n) => onChange(n <= cfg.min ? undefined : n)}
        />
      );
    }

    case 'autocomplete':
      // For now, render as a simple text input
      // Full autocomplete would need async search + dropdown
      return (
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={compact ? 'Tag...' : `${displayLabel}...`}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1.5 text-sm w-32
                       text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-accent"
            title={displayLabel}
          />
          {renderMatchModeToggle()}
        </div>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// RangeFilterControl — single min-threshold slider (e.g. "Prompt success ≥ N%")
// ---------------------------------------------------------------------------

function RangeFilterControl({
  min,
  max,
  step,
  unit,
  value,
  displayLabel,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  unit?: string;
  value: number;
  displayLabel: string;
  onChange: (value: number) => void;
}) {
  const isActive = value > min;
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 min-w-[200px]">
      <div className="flex items-center justify-between text-sm text-neutral-700 dark:text-neutral-200">
        <span>{displayLabel}</span>
        <span className="tabular-nums font-medium">
          {isActive ? `≥ ${value}${unit ?? ''}` : 'Any'}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-accent w-full cursor-pointer"
        aria-label={displayLabel}
      />
      {isActive && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(min)}
          className="self-start text-[11px] text-neutral-500 dark:text-neutral-400 hover:text-accent transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchFilterControl — search input + mini-gallery shortcut + history list
// ---------------------------------------------------------------------------

interface SearchFilterControlProps {
  filterKey: string;
  value: string | undefined;
  icon?: string;
  displayLabel: string;
  compact?: boolean;
  onChange: (value: string | boolean | number | string[] | undefined) => void;
  renderMatchModeToggle: () => ReactNode;
}

function SearchFilterControl({
  filterKey,
  value,
  icon,
  displayLabel,
  compact,
  onChange,
  renderMatchModeToggle,
}: SearchFilterControlProps) {
  const trimmed = (value ?? '').trim();
  const canBrowseSearch = trimmed.length > 0;

  useRecordSearchHistory(filterKey, value);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative">
          {icon && (
            <Icon
              name={icon}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
            />
          )}
          <input
            type="text"
            placeholder={compact ? '' : displayLabel}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={`
              bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1.5 text-sm
              text-neutral-800 dark:text-neutral-200
              focus:outline-none focus:border-accent
              ${icon ? 'pl-8' : ''}
              ${compact ? 'w-32' : 'w-48'}
            `}
          />
        </div>
        <button
          type="button"
          onClick={(e) => {
            if (!canBrowseSearch) return;
            e.stopPropagation();
            e.preventDefault();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
              context: {
                initialFilters: { [filterKey]: trimmed } as AssetFilters,
                sourceLabel: `"${trimmed}"`,
                suppressHoverActions: true,
              },
              x: rect.right + 8,
              y: rect.top,
            });
          }}
          disabled={!canBrowseSearch}
          title={
            canBrowseSearch
              ? `Open "${trimmed}" in Mini Gallery`
              : 'Type something first'
          }
          aria-label={`Open search "${trimmed}" in Mini Gallery`}
          className={`flex-shrink-0 inline-flex items-center justify-center h-7 w-7 rounded text-accent bg-accent/10 hover:bg-accent/25 hover:scale-110 transition-[transform,background-color,opacity] duration-150 ${
            canBrowseSearch ? 'opacity-100' : 'opacity-40 cursor-not-allowed'
          }`}
        >
          <Icon name="externalLink" size={12} className="w-3 h-3" />
        </button>
        {renderMatchModeToggle()}
      </div>
      <SearchHistoryList
        filterKey={filterKey}
        currentValue={value}
        onPick={(query) => onChange(query)}
        toFilters={(query) => ({ [filterKey]: query }) as AssetFilters}
      />
    </div>
  );
}
