/**
 * FamilyItemList
 *
 * Generic list view for items in a browsable plugin family.
 */

import type { BrowsableFamilyConfig } from '@lib/plugins/browsableFamilies';

export interface FamilyItemListProps {
  config: BrowsableFamilyConfig;
  items: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function FamilyItemList({
  config,
  items,
  selectedId,
  onSelect,
}: FamilyItemListProps) {
  const getName = config.getItemName || ((item: any) => item.title || item.name || item.label || item.id);
  const getIcon = config.getItemIcon || ((item: any) => item.icon);

  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {items.map((item) => {
        const id = item.id;
        const name = getName(item);
        const icon = getIcon(item);

        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
              selectedId === id
                ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {icon && <span>{icon}</span>}
              <span className="font-medium truncate">{name}</span>
            </div>
            {item.description && (
              <div className="text-xs text-neutral-500 mt-1 truncate">
                {item.description}
              </div>
            )}
          </button>
        );
      })}
      {items.length === 0 && (
        <p className="text-sm text-neutral-500 py-2">No items registered</p>
      )}
    </div>
  );
}
