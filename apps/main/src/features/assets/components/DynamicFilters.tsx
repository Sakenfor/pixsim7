import { useCallback, useMemo } from 'react';

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
  include_archived: { icon: 'archive', order: 4 },
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
    (key: string, value: string | boolean | number | undefined) => {
      onFiltersChange({
        ...filters,
        [key]: value === '' ? undefined : value,
      });
    },
    [filters, onFiltersChange]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Icon name="loader" className="animate-spin w-4 h-4" />
        Loading filters...
      </div>
    );
  }

  if (error || !metadata) {
    return null; // Fail silently - filters are optional
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibleFilters.map((filter) => (
        <FilterControl
          key={filter.key}
          definition={filter}
          options={metadata.options[filter.key] || []}
          value={filters[filter.key as keyof AssetFilters]}
          onChange={(value) => handleFilterChange(filter.key, value)}
          compact={compact}
        />
      ))}
    </div>
  );
}

interface FilterControlProps {
  definition: FilterDefinition;
  options: FilterOptionValue[];
  value: string | boolean | number | undefined | null;
  onChange: (value: string | boolean | number | undefined) => void;
  compact?: boolean;
}

function FilterControl({ definition, options, value, onChange, compact }: FilterControlProps) {
  const { key, type, label } = definition;
  const uiConfig = FILTER_UI_CONFIG[key] || {};
  const displayLabel = label || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  switch (type) {
    case 'search':
      return (
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
      );

    case 'enum':
      return (
        <select
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm
                     focus:outline-none focus:border-blue-500"
          title={displayLabel}
        >
          <option value="">{compact ? '...' : `All ${displayLabel}`}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label || opt.value}
              {opt.count !== undefined ? ` (${opt.count})` : ''}
            </option>
          ))}
        </select>
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
        <input
          type="text"
          placeholder={compact ? 'Tag...' : `${displayLabel}...`}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm w-32
                     focus:outline-none focus:border-blue-500"
          title={displayLabel}
        />
      );

    default:
      return null;
  }
}
