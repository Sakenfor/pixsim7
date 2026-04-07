/**
 * ReferencePicker — dropdown for @mention suggestions.
 *
 * Renders a filtered list of reference items. Designed to sit above
 * a textarea input. The parent controls visibility and query state.
 *
 * Features:
 *   - Search input at the top for filtering
 *   - Category chips to narrow by type
 *   - Incremental "Show more" when results exceed pageSize
 *   - Arrow key / Enter navigation (from textarea via ref, or from search input)
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import { referenceRegistry } from './registry';
import type { ReferenceItem } from './types';

export interface ReferencePickerProps {
  query: string;
  items: ReferenceItem[];
  onSelect: (item: ReferenceItem) => void;
  onClose: () => void;
  visible: boolean;
  /** Number of items per page (default 25). "Show more" loads another page. */
  pageSize?: number;
}

export interface ReferencePickerHandle {
  /** Call from parent keyDown to navigate the picker. Returns true if consumed. */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

export const ReferencePicker = forwardRef<ReferencePickerHandle, ReferencePickerProps>(
  function ReferencePicker({ query, items, onSelect, onClose, visible, pageSize = 25 }, fwdRef) {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [typeFilter, setTypeFilter] = useState<string | null>(null);
    const [displayLimit, setDisplayLimit] = useState(pageSize);
    const [searchText, setSearchText] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Reset state when picker closes/reopens
    useEffect(() => {
      if (!visible) {
        setTypeFilter(null);
        setDisplayLimit(pageSize);
        setSearchText('');
      }
    }, [visible, pageSize]);

    const sources = useMemo(() => referenceRegistry.getSources(), [visible]);

    // Combine search input text with the parent @query
    const effectiveQuery = searchText || query;

    const allFiltered = useMemo(() => {
      const q = effectiveQuery.toLowerCase();
      return items.filter((i) => {
        if (typeFilter && i.type !== typeFilter) return false;
        if (!q) return true;
        return (
          (i.id ?? '').toLowerCase().includes(q) ||
          (i.label ?? '').toLowerCase().includes(q) ||
          (i.type ?? '').includes(q)
        );
      });
    }, [effectiveQuery, items, typeFilter]);

    const filtered = useMemo(
      () => allFiltered.slice(0, displayLimit),
      [allFiltered, displayLimit],
    );

    const hasMore = allFiltered.length > displayLimit;

    // Reset selection when filter changes
    useEffect(() => {
      setSelectedIdx(0);
    }, [allFiltered.length, effectiveQuery, typeFilter]);

    // Reset page when filter changes
    useEffect(() => {
      setDisplayLimit(pageSize);
    }, [effectiveQuery, typeFilter, pageSize]);

    // Scroll selected item into view
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const els = container.querySelectorAll('[data-ref-item]');
      els[selectedIdx]?.scrollIntoView({ block: 'nearest' });
    }, [selectedIdx]);

    // Shared keyboard navigation for both textarea and search input
    const navigate = (e: React.KeyboardEvent): boolean => {
      if (!visible || filtered.length === 0) {
        if (e.key === 'Escape' && visible) {
          e.preventDefault();
          onClose();
          return true;
        }
        return false;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return true;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIdx]) onSelect(filtered[selectedIdx]);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return true;
      }
      return false;
    };

    useImperativeHandle(fwdRef, () => ({ handleKeyDown: navigate }));

    if (!visible) return null;

    const showCategories = !effectiveQuery && !typeFilter && sources.length > 1;
    const showItems = filtered.length > 0;

    if (!showCategories && !showItems && !typeFilter && !searchText) return null;

    return (
      <div
        ref={containerRef}
        className="absolute bottom-full left-0 right-0 mb-1 mx-2 max-h-[320px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-20"
      >
        {/* Sticky header — search + category chips stay pinned while scrolling */}
        <div className="sticky top-0 bg-white dark:bg-neutral-900 z-10">
          {/* Search input */}
          <div className="px-2 pt-1.5 pb-1 border-b border-neutral-100 dark:border-neutral-800">
            <div className="relative">
              <Icon
                name="search"
                size={11}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  // Let navigate handle arrow/enter/escape; don't stop other keys
                  navigate(e);
                }}
                placeholder="Search..."
                className="w-full pl-6 pr-2 py-1 text-[11px] bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400 outline-none focus:border-accent/50"
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Category chips — shown when query is empty */}
          {(showCategories || typeFilter) && (
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800 flex-wrap">
              {typeFilter ? (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setTypeFilter(null);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent"
                >
                  <Icon name={referenceRegistry.getIcon(typeFilter)} size={10} />
                  {sources.find((s) => s.type === typeFilter)?.label ?? typeFilter}
                  <Icon name="x" size={8} className="ml-0.5 opacity-60" />
                </button>
              ) : (
                sources.map((src) => {
                  const color = referenceRegistry.getColor(src.type);
                  return (
                    <button
                      key={src.type}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setTypeFilter(src.type);
                      }}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors ${color}`}
                    >
                      <Icon name={src.icon} size={10} />
                      {src.label}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Items list */}
        {filtered.map((item, i) => {
          const indent = item.indent ?? 0;
          return (
            <button
              key={`${item.type}:${item.id}`}
              data-ref-item
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
              className={`w-full flex items-center gap-2 py-1.5 text-[11px] text-left transition-colors ${
                i === selectedIdx
                  ? 'bg-accent/10 text-accent'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
              style={{ paddingLeft: `${12 + indent * 16}px`, paddingRight: '12px' }}
            >
              {indent > 0 && (
                <span className="text-neutral-300 dark:text-neutral-600 text-[9px] shrink-0">&#x2514;</span>
              )}
              <Icon
                name={referenceRegistry.getIcon(item.type)}
                size={indent > 0 ? 10 : 11}
                className={`shrink-0 ${indent > 0 ? 'opacity-60' : ''} ${referenceRegistry.getColor(item.type)}`}
              />
              <div className="flex-1 min-w-0">
                <div className={`truncate font-medium ${indent > 0 ? 'text-[10px]' : ''}`}>{item.label}</div>
                {item.detail && (
                  <div className={`text-[9px] truncate ${item.detailColor ?? 'text-neutral-400'}`}>
                    {item.detail}
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* Show more */}
        {hasMore && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setDisplayLimit((c) => c + pageSize);
            }}
            className="w-full py-1.5 text-[10px] text-accent hover:bg-accent/5 transition-colors text-center font-medium border-t border-neutral-100 dark:border-neutral-800"
          >
            Show more ({allFiltered.length - displayLimit} remaining)
          </button>
        )}

        {/* No results hint when filtered */}
        {(typeFilter || effectiveQuery) && filtered.length === 0 && (
          <div className="px-3 py-2 text-[10px] text-neutral-400 text-center">
            No {typeFilter ? (sources.find((s) => s.type === typeFilter)?.label?.toLowerCase() ?? typeFilter) : 'items'} found
            {effectiveQuery ? ` matching "${effectiveQuery}"` : ''}
          </div>
        )}
      </div>
    );
  },
);
