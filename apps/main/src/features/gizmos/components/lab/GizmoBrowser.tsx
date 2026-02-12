/**
 * Gizmo Browser
 *
 * Filterable list of registered gizmos. Selecting a gizmo updates
 * the shared gizmoLabStore so the playground can render it.
 */

import { getAllGizmos } from '@pixsim7/scene.gizmos';
import { useMemo } from 'react';

import { useGizmoLabStore } from '../../stores/gizmoLabStore';

export function GizmoBrowser() {
  const selectedGizmoId = useGizmoLabStore((s) => s.selectedGizmoId);
  const gizmoFilter = useGizmoLabStore((s) => s.gizmoFilter);
  const selectGizmo = useGizmoLabStore((s) => s.selectGizmo);
  const setGizmoFilter = useGizmoLabStore((s) => s.setGizmoFilter);

  const allGizmos = useMemo(() => getAllGizmos(), []);

  const categories = useMemo(() => {
    const cats = new Set(allGizmos.map((g) => g.category));
    return ['all', ...Array.from(cats)];
  }, [allGizmos]);

  const filteredGizmos = useMemo(() => {
    if (gizmoFilter === 'all') return allGizmos;
    return allGizmos.filter((g) => g.category === gizmoFilter);
  }, [allGizmos, gizmoFilter]);

  return (
    <div className="p-4 space-y-3 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Gizmos</h2>
        <select
          className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
          value={gizmoFilter}
          onChange={(e) => setGizmoFilter(e.target.value)}
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat === 'all' ? 'All Categories' : cat}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        {filteredGizmos.map((gizmo) => (
          <button
            key={gizmo.id}
            onClick={() => selectGizmo(gizmo.id)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              selectedGizmoId === gizmo.id
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <div className="font-medium">{gizmo.name}</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {gizmo.id} • {gizmo.category}
            </div>
            {gizmo.tags && (
              <div className="flex gap-1 mt-1">
                {gizmo.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
