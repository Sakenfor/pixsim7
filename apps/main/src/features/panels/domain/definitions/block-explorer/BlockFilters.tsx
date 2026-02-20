/**
 * BlockFilters — Search, package, and tag facet filters for the Block Explorer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

// ============================================================================
// Types
// ============================================================================

export interface TagFilter {
  key: string;
  value: string;
}

interface BlockFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  packages: string[];
  selectedPackage: string | null;
  onPackageChange: (pkg: string | null) => void;
  tagFacets: Record<string, string[]>;
  activeTagFilters: TagFilter[];
  onTagFilterAdd: (filter: TagFilter) => void;
  onTagFilterRemove: (filter: TagFilter) => void;
  onClearFilters: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function BlockFilters({
  searchQuery,
  onSearchChange,
  packages,
  selectedPackage,
  onPackageChange,
  tagFacets,
  activeTagFilters,
  onTagFilterAdd,
  onTagFilterRemove,
  onClearFilters,
}: BlockFiltersProps) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Sync local query when external searchQuery changes (e.g. on clear)
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setLocalQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onSearchChange(value), 300);
    },
    [onSearchChange],
  );

  const toggleKey = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isTagActive = useCallback(
    (key: string, value: string) =>
      activeTagFilters.some((f) => f.key === key && f.value === value),
    [activeTagFilters],
  );

  const hasActiveFilters = searchQuery || selectedPackage || activeTagFilters.length > 0;

  const facetKeys = Object.keys(tagFacets);

  return (
    <div className="space-y-2 px-2 py-2">
      {/* Text search */}
      <div className="relative">
        <Icon
          name="search"
          size={12}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
        />
        <input
          type="text"
          value={localQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search blocks..."
          className="w-full bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-200 pl-7 pr-2 py-1 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500"
        />
      </div>

      {/* Package select */}
      {packages.length > 0 && (
        <select
          value={selectedPackage ?? ''}
          onChange={(e) => onPackageChange(e.target.value || null)}
          className="w-full bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-300 px-2 py-1 focus:outline-none focus:border-neutral-500"
        >
          <option value="">All packages</option>
          {packages.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )}

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1">
          {activeTagFilters.map((f) => (
            <button
              key={`${f.key}:${f.value}`}
              onClick={() => onTagFilterRemove(f)}
              className="flex items-center gap-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-1.5 py-0.5 text-[10px] hover:bg-blue-500/30 transition-colors"
            >
              <span>
                {f.key}:{f.value}
              </span>
              <Icon name="x" size={8} className="text-blue-400" />
            </button>
          ))}
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 px-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Tag facet browser */}
      {facetKeys.length > 0 && (
        <div className="space-y-0.5">
          <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
            Tags
          </h4>
          {facetKeys.map((key) => (
            <div key={key}>
              <button
                onClick={() => toggleKey(key)}
                className="w-full flex items-center gap-1 px-1 py-0.5 text-left hover:bg-neutral-800/60 rounded transition-colors"
              >
                <Icon
                  name={expandedKeys.has(key) ? 'chevronDown' : 'chevronRight'}
                  size={10}
                  className="text-neutral-500 shrink-0"
                />
                <span className="text-[11px] text-neutral-400 truncate">{key}</span>
                <span className="text-[9px] text-neutral-600 ml-auto">
                  {tagFacets[key].length}
                </span>
              </button>

              {expandedKeys.has(key) && (
                <div className="ml-4 flex flex-wrap gap-1 py-0.5">
                  {tagFacets[key].map((value) => {
                    const active = isTagActive(key, value);
                    return (
                      <button
                        key={value}
                        onClick={() =>
                          active
                            ? onTagFilterRemove({ key, value })
                            : onTagFilterAdd({ key, value })
                        }
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          active
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            : 'bg-neutral-800/50 text-neutral-400 border-neutral-700/50 hover:border-neutral-600 hover:text-neutral-300'
                        }`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
