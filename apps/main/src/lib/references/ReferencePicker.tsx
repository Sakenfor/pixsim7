/**
 * ReferencePicker — dropdown for @mention suggestions.
 *
 * Renders a filtered list of reference items. Designed to sit above
 * a textarea input. The parent controls visibility and query state.
 *
 * When the query is empty, shows category chips to narrow by type.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import { referenceRegistry } from './registry';
import type { ReferenceItem } from './types';

export interface ReferencePickerProps {
  query: string;
  items: ReferenceItem[];
  onSelect: (item: ReferenceItem) => void;
  onClose: () => void;
  visible: boolean;
  maxResults?: number;
}

export function ReferencePicker({
  query,
  items,
  onSelect,
  visible,
  maxResults = 25,
}: ReferencePickerProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Reset type filter when picker closes/reopens
  useEffect(() => {
    if (!visible) setTypeFilter(null);
  }, [visible]);

  const sources = useMemo(() => referenceRegistry.getSources(), [visible]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items
      .filter((i) => {
        if (typeFilter && i.type !== typeFilter) return false;
        if (!q) return true;
        return (
          (i.id ?? '').toLowerCase().includes(q) ||
          (i.label ?? '').toLowerCase().includes(q) ||
          (i.type ?? '').includes(q)
        );
      })
      .slice(0, maxResults);
  }, [query, items, maxResults, typeFilter]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [filtered]);

  if (!visible) return null;

  const showCategories = !query && !typeFilter && sources.length > 1;
  const showItems = filtered.length > 0;

  if (!showCategories && !showItems) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-1 mx-2 max-h-[240px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-20"
    >
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
            sources.map((src) => (
              <button
                key={src.type}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setTypeFilter(src.type);
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                <Icon name={src.icon} size={10} />
                {src.label}
              </button>
            ))
          )}
        </div>
      )}

      {/* Items list */}
      {filtered.map((item, i) => (
        <button
          key={`${item.type}:${item.id}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${
            i === selectedIdx
              ? 'bg-accent/10 text-accent'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
          }`}
        >
          <Icon
            name={referenceRegistry.getIcon(item.type)}
            size={11}
            className="shrink-0 text-neutral-400"
          />
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{item.label}</div>
            <div className="text-[9px] text-neutral-400 truncate">
              {item.type}:{item.id}
              {item.detail ? ` — ${item.detail}` : ''}
            </div>
          </div>
        </button>
      ))}

      {/* No results hint when filtered */}
      {typeFilter && filtered.length === 0 && (
        <div className="px-3 py-2 text-[10px] text-neutral-400 text-center">
          No {sources.find((s) => s.type === typeFilter)?.label?.toLowerCase() ?? typeFilter} found
          {query ? ` matching "${query}"` : ''}
        </div>
      )}
    </div>
  );
}
