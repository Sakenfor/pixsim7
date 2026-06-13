import { useMemo, useState } from 'react';

import { Icon, Icons, type IconName } from '@lib/icons';

const ALL_ICON_NAMES = Object.keys(Icons) as IconName[];

/**
 * Searchable grid for picking an @lib/icons name. Used to give an asset set a
 * glyph (rendered on the media-card hover add-target toggle). The first cell
 * clears the selection.
 */
export function IconPicker({
  value,
  onSelect,
}: {
  /** Currently-selected icon name, if any. */
  value?: string;
  /** Called with the chosen name, or `undefined` to clear. */
  onSelect: (name: string | undefined) => void;
}) {
  const [query, setQuery] = useState('');
  const names = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ALL_ICON_NAMES.filter((n) => n.toLowerCase().includes(q)) : ALL_ICON_NAMES;
  }, [query]);

  return (
    <div className="flex flex-col gap-1 p-1 w-56">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons…"
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
