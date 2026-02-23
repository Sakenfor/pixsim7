import { useState } from 'react';

import { Icon } from '@lib/icons';

import {
  useAssetSetStore,
  type AssetSetKind,
} from '@features/assets/stores/assetSetStore';

import { SetEditView } from './SetEditView';

export function AssetSetsPanel() {
  const { sets, createSet } = useAssetSetStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKindPicker, setShowKindPicker] = useState(false);

  const editingSet = editingId ? sets.find((s) => s.id === editingId) : null;

  if (editingSet) {
    return <SetEditView set={editingSet} onBack={() => setEditingId(null)} />;
  }

  const handleCreate = (kind: AssetSetKind) => {
    const newSet = createSet({
      name: kind === 'manual' ? 'New Set' : 'New Smart Set',
      kind,
      ...(kind === 'manual' ? { assetIds: [] } : { filters: {} }),
    } as any);
    setShowKindPicker(false);
    setEditingId(newSet.id);
  };

  return (
    <div className="flex flex-col gap-1 p-2 h-full overflow-y-auto thin-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Asset Sets</h3>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowKindPicker((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg bg-accent text-accent-text hover:bg-accent-hover"
          >
            <Icon name="plus" size={12} />
            New
          </button>
          {showKindPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 min-w-[140px]">
              <button
                type="button"
                onClick={() => handleCreate('manual')}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <Icon name="layers" size={12} className="text-blue-500" />
                Manual Set
              </button>
              <button
                type="button"
                onClick={() => handleCreate('smart')}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <Icon name="search" size={12} className="text-emerald-500" />
                Smart Set
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {sets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Icon name="layers" size={28} className="text-neutral-300 dark:text-neutral-600 mb-2" />
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            No asset sets yet.
          </p>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            Create a set to use with generation strategies.
          </p>
        </div>
      )}

      {/* Set list */}
      {sets.map((set) => (
        <button
          key={set.id}
          type="button"
          onClick={() => setEditingId(set.id)}
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left group transition-colors"
        >
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: set.color || (set.kind === 'manual' ? '#3B82F6' : '#10B981') }}
          >
            <Icon
              name={set.kind === 'manual' ? 'layers' : 'search'}
              size={14}
              color="#fff"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-neutral-800 dark:text-neutral-100 truncate">
              {set.name}
            </div>
            <div className="text-[9px] text-neutral-400">
              {set.kind === 'manual'
                ? `${set.assetIds.length} asset${set.assetIds.length !== 1 ? 's' : ''}`
                : 'Smart filter'}
            </div>
          </div>
          <Icon name="chevronRight" size={12} className="text-neutral-300 dark:text-neutral-600 opacity-0 group-hover:opacity-100" />
        </button>
      ))}
    </div>
  );
}
