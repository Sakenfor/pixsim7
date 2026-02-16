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

import type { AssetFilters } from '../hooks/useAssets';
import { useFilterMetadata } from '../hooks/useFilterMetadata';
import type { FilterDefinition, FilterOptionValue } from '../lib/api';
import { usePinnedFiltersStore } from '../stores/pinnedFiltersStore';

/**
 * UI-specific metadata for filter keys.
 * Frontend owns display concerns (icons, order, labels override).
 */
const FILTER_UI_CONFIG: Record<string, { icon?: string; order?: number; overflow?: boolean }> = {
  q: { icon: 'search', order: 0 },
  media_type: { icon: 'video', order: 1 },
  provider_id: { icon: 'globe', order: 2 },
  tag: { icon: 'tag', order: 3 },
  analysis_tags: { icon: 'sparkles', order: 4 },
  upload_method: { icon: 'upload', order: 5 },
  source_site: { icon: 'globe', order: 7 },
  source_path: { icon: 'folderTree', order: 7 },
  source_filename: { icon: 'video', order: 7 },
  source_folder_id: { icon: 'folder', order: 7 },
  source_relative_path: { icon: 'folder-tree', order: 7 },
  source_url: { icon: 'external-link', order: 7 },
  // Overflow: shown in the "more" menu instead of the main bar
  missing_prompt: { icon: 'fileQuestion', order: 80, overflow: true },
  missing_analysis: { icon: 'scanSearch', order: 81, overflow: true },
  missing_embedding: { icon: 'eye', order: 82, overflow: true },
  missing_tags: { icon: 'tags', order: 83, overflow: true },
  include_archived: { icon: 'archive', order: 90, overflow: true },
  provider_status: { icon: 'shield', order: 91, overflow: true },
};

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
}: DynamicFiltersProps) {
  const [openFilters, setOpenFilters] = useState<Set<string>>(new Set());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
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
  });

  const pinnedKeys = usePinnedFiltersStore((s) => s.pinnedKeys);
  const togglePin = usePinnedFiltersStore((s) => s.togglePin);

  // Sort and split into primary bar vs overflow menu
  const { primaryFilters, overflowFilters } = useMemo(() => {
    if (!metadata) return { primaryFilters: [], overflowFilters: [] };

    const hasActiveSelection = (key: string) => {
      const val = filters[key as keyof AssetFilters];
      if (val === undefined || val === null || val === '' || val === false) return false;
      if (Array.isArray(val)) return val.length > 0;
      return true;
    };

    const all = metadata.filters
      .filter((f) => {
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
  }, [metadata, include, exclude, pinnedKeys, filters]);

  const handleFilterChange = useCallback(
    (key: string, value: string | boolean | number | string[] | undefined) => {
      const normalized = Array.isArray(value)
        ? value.length > 0
          ? value
          : undefined
        : value === ''
          ? undefined
          : value;
      onFiltersChange({
        ...filters,
        [key]: normalized,
      });
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
        const selectedValue = filters[filter.key as keyof AssetFilters];
        const selectedCount = Array.isArray(selectedValue)
          ? selectedValue.length
          : selectedValue
            ? 1
            : 0;
        const hasSelection = selectedCount > 0;
        const uiConfig = FILTER_UI_CONFIG[filter.key] || {};
        const resolvedIcon = uiConfig.icon ?? 'sliders';
        const displayLabel =
          filter.label ||
          filter.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        const isPinned = pinnedKeys.includes(filter.key);

        return (
          <div
            key={filter.key}
            className="relative group flex-none"
            onMouseEnter={() => openHover(filter.key)}
            onMouseLeave={() => closeHover(filter.key)}
            onContextMenu={(e) => {
              e.preventDefault();
              togglePin(filter.key);
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
              className={`relative z-20 inline-flex items-center gap-1.5 h-7 px-1.5 rounded border text-xs overflow-hidden transition-[max-width,background-color,border-color] duration-200 ${
                hasSelection
                  ? 'border-accent/50 bg-accent/10 text-neutral-800 dark:text-neutral-100'
                  : isOpen
                    ? 'max-w-[320px] border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                    : 'max-w-7 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 group-hover:max-w-[320px] group-focus-within:max-w-[320px] group-hover:border-neutral-300 dark:group-hover:border-neutral-600'
              } ${hasSelection ? 'max-w-[320px]' : ''}`}
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
              <span
                className={`font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ${
                  isOpen || hasSelection
                    ? 'max-w-[240px] opacity-100'
                    : 'max-w-0 opacity-0 group-hover:max-w-[240px] group-hover:opacity-100 group-focus-within:max-w-[240px] group-focus-within:opacity-100'
                }`}
              >
                {displayLabel}
              </span>
              {isPinned && (
                <span className="flex-shrink-0 text-accent">
                  <Icon name="pin" size={10} className="w-2.5 h-2.5" />
                </span>
              )}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(filter.key);
                }}
                className={`flex-shrink-0 cursor-pointer transition-opacity duration-150 ${
                  isPinned
                    ? 'opacity-0'
                    : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
              >
                <Icon name="pin" size={10} className="w-2.5 h-2.5" />
              </span>
            </button>
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
                options={metadata.options[filter.key] || []}
                value={filters[filter.key as keyof AssetFilters]}
                onChange={(value) => handleFilterChange(filter.key, value)}
                matchModes={filter.match_modes}
                mode={filters[`${filter.key}__mode` as keyof AssetFilters] as string | undefined}
                onModeChange={(mode) => handleFilterChange(`${filter.key}__mode`, mode)}
                compact={compact}
              />
            </FilterDropdown>
          </div>
        );
      })}
      {overflowFilters.length > 0 && (
        <OverflowMenu
          filters={overflowFilters}
          metadata={metadata}
          values={filters}
          onChange={handleFilterChange}
          hasSelection={hasOverflowSelection}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible group for namespaced tag options
// ---------------------------------------------------------------------------

function CollapsibleGroup({
  label,
  showHeader,
  count,
  children,
}: {
  label: string;
  showHeader: boolean;
  count: number;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (!showHeader) {
    return <div className="flex flex-col gap-1">{children}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex items-center gap-1 w-full text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold px-1 py-1 sticky top-0 bg-white/95 dark:bg-neutral-900/95 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
      >
        <Icon
          name="chevronRight"
          size={10}
          className={`w-2.5 h-2.5 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
        />
        <span className="flex-1 text-left">{label}</span>
        {count > 0 && (
          <span className="text-[9px] px-1 rounded-full bg-accent/20 text-accent not-uppercase normal-case font-normal">
            {count}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1 pl-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overflow "more" menu — renders boolean toggles & secondary filters
// ---------------------------------------------------------------------------

interface OverflowMenuProps {
  filters: FilterDefinition[];
  metadata: { options: Record<string, FilterOptionValue[]> };
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
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 240 - 8)),
            top: rect.bottom + 6,
            zIndex: 60,
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
                  filter.label ||
                  filter.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                const val = values[filter.key as keyof AssetFilters];

                if (filter.type === 'boolean') {
                  return (
                    <label
                      key={filter.key}
                      className="flex items-center gap-2 px-1 py-0.5 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!!val}
                        onChange={(e) => onChange(filter.key, e.target.checked ? true : undefined)}
                        className="accent-accent"
                      />
                      {uiConfig.icon && <Icon name={uiConfig.icon} size={14} className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />}
                      <span>{displayLabel}</span>
                    </label>
                  );
                }

                // Enum overflow filters (e.g. provider_status)
                if (filter.type === 'enum') {
                  const options = metadata.options[filter.key] || [];
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
                        return (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2 px-1 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer"
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
                              className="accent-accent"
                            />
                            <span>{opt.label || opt.value}</span>
                          </label>
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
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 60,
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
    case 'search':
      return (
        <div className="flex items-center gap-2">
          <div className="relative">
            {uiConfig.icon && (
              <Icon
                name={uiConfig.icon}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
              />
            )}
            <input
              type="text"
              placeholder={compact ? '' : displayLabel}
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value || undefined)}
              className={`
                bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1.5 text-sm
                text-neutral-800 dark:text-neutral-200
                focus:outline-none focus:border-accent
                ${uiConfig.icon ? 'pl-8' : ''}
                ${compact ? 'w-32' : 'w-48'}
              `}
            />
          </div>
          {renderMatchModeToggle()}
        </div>
      );

    case 'enum': {
      const isTagLike = key === 'tag' || key === 'analysis_tags';
      const isFolderPath = key === 'source_path';
      const shouldGroup = (isTagLike || isFolderPath) && options.length > 0;
      const groupSeparator = isFolderPath ? '/' : ':';

      const renderOption = (opt: FilterOptionValue, stripNamespace: boolean) => {
        const optValue = String(opt.value);
        const isSelected = selectedValues.includes(optValue);
        let displayLabel: string;
        if (stripNamespace) {
          const parts = opt.value.split(groupSeparator);
          const afterSep = parts.slice(1).join(groupSeparator);
          displayLabel = afterSep || (isFolderPath ? '(root)' : opt.value);
        } else {
          displayLabel = opt.label || opt.value;
        }
        return (
          <label
            key={opt.value}
            className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer"
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
              className="accent-accent"
            />
            <span>
              {displayLabel}
              {opt.count !== undefined ? ` (${opt.count})` : ''}
            </span>
          </label>
        );
      };

      if (shouldGroup) {
        const grouped = groupOptionsByNamespace(
          options,
          groupSeparator,
          isFolderPath ? undefined : 'other',
        );
        const groups = Array.from(grouped.entries());
        const showHeaders = groups.length > 1;

        return (
          <div className="space-y-2">
            {renderMatchModeToggle()}
            <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto">
              {groups.map(([namespace, nsOptions]) => (
                <CollapsibleGroup
                  key={namespace}
                  label={namespace}
                  showHeader={showHeaders}
                  count={nsOptions.filter((o) => selectedValues.includes(String(o.value))).length}
                >
                  {nsOptions.map((opt) => renderOption(opt, showHeaders))}
                </CollapsibleGroup>
              ))}
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {renderMatchModeToggle()}
          <div className="flex flex-col gap-1">
            {options.length === 0 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">No options available.</div>
            )}
            {options.map((opt) => renderOption(opt, false))}
          </div>
        </div>
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
