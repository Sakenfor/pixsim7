/**
 * Tool Browser
 *
 * Filterable list of registered interactive tools. Selecting a tool
 * updates the shared gizmoLabStore so the playground can render it.
 */

import { getAllTools } from '@pixsim7/scene.gizmos';
import { useMemo } from 'react';

import { useGizmoLabStore } from '../../stores/gizmoLabStore';

export function ToolBrowser() {
  const selectedToolId = useGizmoLabStore((s) => s.selectedToolId);
  const toolFilter = useGizmoLabStore((s) => s.toolFilter);
  const selectTool = useGizmoLabStore((s) => s.selectTool);
  const setToolFilter = useGizmoLabStore((s) => s.setToolFilter);

  const allTools = useMemo(() => getAllTools(), []);

  const toolTypes = useMemo(() => {
    const types = new Set(allTools.map((t) => t.type));
    return ['all', ...Array.from(types)];
  }, [allTools]);

  const filteredTools = useMemo(() => {
    if (toolFilter === 'all') return allTools;
    return allTools.filter((t) => t.type === toolFilter);
  }, [allTools, toolFilter]);

  return (
    <div className="p-4 space-y-3 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Tools</h2>
        <select
          className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value)}
        >
          {toolTypes.map((type) => (
            <option key={type} value={type}>
              {type === 'all' ? 'All Types' : type}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        {filteredTools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => selectTool(tool.id)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              selectedToolId === tool.id
                ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <div className="font-medium capitalize">{tool.id}</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {tool.type} • {tool.visual.model}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
