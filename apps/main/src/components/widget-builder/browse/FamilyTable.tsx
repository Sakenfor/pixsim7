/**
 * FamilyTable
 *
 * Table view for browsable family items with configurable columns.
 */

import type { BrowsableFamilyConfig } from '@lib/plugins/browsableFamilies';

export interface FamilyTableProps {
  config: BrowsableFamilyConfig;
  items: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function FamilyTable({
  config,
  items,
  selectedId,
  onSelect,
}: FamilyTableProps) {
  const columns = config.columns || [
    { id: 'id', label: 'ID', render: (item: any) => item.id },
    { id: 'name', label: 'Name', render: (item: any) => item.title || item.name || item.label || item.id },
  ];

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-700">
            {columns.map((col) => (
              <th
                key={col.id}
                className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase"
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`border-b border-neutral-100 dark:border-neutral-800 cursor-pointer transition-colors ${
                selectedId === item.id
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
              }`}
            >
              {columns.map((col) => (
                <td key={col.id} className="px-3 py-2">
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <div className="text-center py-8 text-neutral-500">
          No items registered
        </div>
      )}
    </div>
  );
}
