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

/**
 * UI-specific metadata for filter keys.
 * Frontend owns display concerns (icons, order, labels override).
 */
const FILTER_UI_CONFIG: Record<string, { icon?: string; order?: number }> = {
  q: { icon: 'search', order: 0 },
  media_type: { icon: 'video', order: 1 },
  provider_id: { icon: 'globe', order: 2 },
  tag: { icon: 'tag', order: 3 },
  analysis_tags: { icon: 'sparkles', order: 4 },
  include_archived: { icon: 'archive', order: 4 },
  upload_method: { icon: 'upload', order: 5 },
  provider_status: { icon: 'shield', order: 6 },
};

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

  // Sort and filter the definitions
  const visibleFilters = useMemo(() => {
    if (!metadata) return [];

    return metadata.filters
      .filter((f) => {
        if (include && !include.includes(f.key)) return false;
        if (exclude.includes(f.key)) return false;
        return true;
      })
      .sort((a, b) => {
        const orderA = FILTER_UI_CONFIG[a.key]?.order ?? 99;
        const orderB = FILTER_UI_CONFIG[b.key]?.order ?? 99;
        return orderA - orderB;
      });
  }, [metadata, include, exclude]);

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
      <div className="flex items-center gap-2 text-sm text-gray-400">
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

  if (visibleFilters.length === 0) {
    return (
      <div className="text-sm text-neutral-500 dark:text-neutral-400">
        No filters available.
      </div>
    );
  }

  return (
    <div className="relative flex flex-nowrap items-start gap-2 w-full overflow-x-auto overflow-y-visible pb-1">
      {visibleFilters.map((filter) => {
        const isOpen = openFilters.has(filter.key);
        const isHovered = hoveredKey === filter.key;
        const isVisible = isOpen || isHovered;
        const selectedValue = filters[filter.key as keyof AssetFilters];
        const selectedCount = Array.isArray(selectedValue)
          ? selectedValue.length
          : selectedValue
            ? 1
            : 0;
        const uiConfig = FILTER_UI_CONFIG[filter.key] || {};
        const displayLabel =
          filter.label ||
          filter.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        return (
          <div
            key={filter.key}
            className="relative group flex-none"
            onMouseEnter={() => openHover(filter.key)}
            onMouseLeave={() => closeHover(filter.key)}
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
              className={`relative z-20 inline-flex items-center gap-2 h-10 px-2 rounded-md border border-gray-700 bg-gray-900/60 text-sm overflow-hidden transition-[max-width,background-color] duration-200 ${
                isOpen
                  ? 'max-w-[320px] bg-gray-900/80'
                  : 'max-w-10 group-hover:max-w-[320px] group-focus-within:max-w-[320px] group-hover:bg-gray-900/80'
              }`}
            >
              <span className="relative">
                {uiConfig.icon && <Icon name={uiConfig.icon} className="w-4 h-4 text-gray-400" />}
                {selectedCount > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] px-1 rounded-full bg-blue-500 text-gray-950">
                    {selectedCount}
                  </span>
                )}
              </span>
              <span
                className={`font-medium text-gray-100 whitespace-nowrap overflow-hidden transition-all duration-200 ${
                  isOpen
                    ? 'max-w-[240px] opacity-100'
                    : 'max-w-0 opacity-0 group-hover:max-w-[240px] group-hover:opacity-100 group-focus-within:max-w-[240px] group-focus-within:opacity-100'
                }`}
              >
                {displayLabel}
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
              className={`px-2 py-0.5 text-[10px] uppercase tracking-wide border rounded ${
                active
                  ? 'bg-blue-600/40 border-blue-400 text-blue-100'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
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
                className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              />
            )}
            <input
              type="text"
              placeholder={compact ? '' : displayLabel}
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value || undefined)}
              className={`
                bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm
                focus:outline-none focus:border-blue-500
                ${uiConfig.icon ? 'pl-8' : ''}
                ${compact ? 'w-32' : 'w-48'}
              `}
            />
          </div>
          {renderMatchModeToggle()}
        </div>
      );

    case 'enum':
      return (
        <div className="space-y-2">
          {renderMatchModeToggle()}
          <div className="flex flex-col gap-1">
            {options.length === 0 && (
              <div className="text-xs text-gray-400">No options available.</div>
            )}
            {options.map((opt) => {
              const optValue = String(opt.value);
              const isSelected = selectedValues.includes(optValue);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer"
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
                    className="accent-blue-500"
                  />
                  <span>
                    {opt.label || opt.value}
                    {opt.count !== undefined ? ` (${opt.count})` : ''}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      );

    case 'boolean':
      return (
        <label
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer
            ${value ? 'bg-blue-600/30 border-blue-500' : 'bg-gray-800 border-gray-700'}
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
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm w-32
                       focus:outline-none focus:border-blue-500"
            title={displayLabel}
          />
          {renderMatchModeToggle()}
        </div>
      );

    default:
      return null;
  }
}
