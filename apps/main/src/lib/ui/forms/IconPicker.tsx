import { useMemo, useState } from 'react';

import { Icon, Icons, type IconName } from '@lib/icons';

/**
 * Distinct icons for display. The registry intentionally keeps alias keys that
 * resolve to the same component (e.g. `zoomIn` and `zoom-in`) as safety nets so
 * either name style works at call sites — but the picker should show each glyph
 * once. Collapse by component identity, preferring the camelCase alias (no
 * `-`/`_`) for a stable, conventional label.
 */
const ALL_ICON_NAMES: IconName[] = (() => {
  const byComponent = new Map<unknown, IconName>();
  for (const [name, component] of Object.entries(Icons) as [IconName, unknown][]) {
    const existing = byComponent.get(component);
    if (!existing || (/[-_]/.test(existing) && !/[-_]/.test(name))) {
      byComponent.set(component, name);
    }
  }
  return [...byComponent.values()].sort((a, b) => a.localeCompare(b));
})();

export interface IconPickerProps {
  /** Currently-selected icon name, if any. */
  value?: string;
  /** Called with the chosen name, or `undefined` to clear. */
  onSelect: (name: string | undefined) => void;
  /** Placeholder for the search box. */
  searchPlaceholder?: string;
  /** Extra classes on the root container. */
  className?: string;
}

/**
 * Searchable grid for picking an `@lib/icons` name. The canonical icon picker —
 * the first cell clears the selection. Stateless beyond its own search query;
 * the caller owns the selected value and decides how to surface the picker
 * (inline, popover, dialog).
 */
export function IconPicker({ value, onSelect, searchPlaceholder = 'Search icons…', className }: IconPickerProps) {
  const [query, setQuery] = useState('');
  const names = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ALL_ICON_NAMES.filter((n) => n.toLowerCase().includes(q)) : ALL_ICON_NAMES;
  }, [query]);

  return (
    <div className={`flex flex-col gap-1 p-1 w-56 ${className ?? ''}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        className="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 outline-none focus:border-accent"
      />
      <div className="grid grid-cols-6 gap-0.5 max-h-48 overflow-y-auto thin-scrollbar">
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          title="No icon"
          className={`flex items-center justify-center aspect-square rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 ${
            !value ? 'ring-2 ring-accent' : ''
          }`}
        >
          <Icon name="x" size={14} />
        </button>
        {names.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(n)}
            title={n}
            className={`flex items-center justify-center aspect-square rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-200 ${
              value === n ? 'ring-2 ring-accent' : ''
            }`}
          >
            <Icon name={n} size={14} />
          </button>
        ))}
        {names.length === 0 && (
          <div className="col-span-6 text-[10px] text-neutral-400 text-center py-3">No icons match.</div>
        )}
      </div>
    </div>
  );
}
