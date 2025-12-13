/**
 * List Widget
 *
 * Display a list of items with optional filtering and sorting.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 * Integrated with Task 51 data binding system.
 */

import { useState, useMemo } from 'react';
import type { WidgetProps } from '@lib/ui/composer/widgetRegistry';

export interface ListWidgetConfig {
  title?: string;
  itemKey?: string; // Key to use for items if data is array of objects
  emptyMessage?: string;
  maxItems?: number;
  sortable?: boolean;
  searchable?: boolean;
}

export interface ListWidgetProps extends WidgetProps {
  config: ListWidgetConfig;
  items?: any[]; // From Task 51 data binding
  data?: any; // Legacy support
}

export function ListWidget({ config, items: boundItems, data }: ListWidgetProps) {
  const {
    title = 'List',
    itemKey,
    emptyMessage = 'No items',
    maxItems,
    sortable = false,
    searchable = false,
  } = config;

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Priority: bound items > data prop
  const sourceData = boundItems !== undefined ? boundItems : data;

  // Convert data to array of strings
  const items: string[] = useMemo(() => {
    if (!sourceData) return [];
    if (Array.isArray(sourceData)) {
      return sourceData.map((item) => {
        if (typeof item === 'object' && itemKey) {
          return String(item[itemKey]);
        }
        return String(item);
      });
    }
    return [String(sourceData)];
  }, [sourceData, itemKey]);

  // Apply search and sort
  const filteredItems = useMemo(() => {
    let result = items;

    // Apply search
    if (searchable && searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) => item.toLowerCase().includes(query));
    }

    // Apply sort
    if (sortable) {
      result = [...result].sort((a, b) => {
        if (sortOrder === 'asc') {
          return a.localeCompare(b);
        } else {
          return b.localeCompare(a);
        }
      });
    }

    // Apply max items limit
    if (maxItems) {
      result = result.slice(0, maxItems);
    }

    return result;
  }, [items, searchQuery, sortOrder, sortable, searchable, maxItems]);

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {sortable && (
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="text-xs px-2 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          )}
        </div>
        {searchable && (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          />
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredItems.length === 0 ? (
          <div className="text-center py-4 text-sm text-neutral-500">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredItems.map((item, index) => (
              <div
                key={index}
                className="px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {maxItems && filteredItems.length >= maxItems && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs text-neutral-500">
          Showing {filteredItems.length} of {items.length} items
        </div>
      )}
    </div>
  );
}
