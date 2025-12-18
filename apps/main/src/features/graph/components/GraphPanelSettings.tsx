/**
 * Graph Panel Settings
 *
 * Settings UI for the Graph panel.
 * Part of Task 50 Phase 50.4 - Decentralized Panel Settings System
 */

import type { PanelSettingsProps } from '@features/panels/lib/panelRegistry';

export interface GraphPanelSettings {
  graphEditorId?: 'scene-graph-v2' | 'arc-graph';
}

/**
 * Graph Editor Selector Component
 */
export function GraphPanelSettingsComponent({
  settings,
  helpers,
}: PanelSettingsProps<GraphPanelSettings>) {
  const activeEditor = settings.graphEditorId || 'scene-graph-v2';

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Graph Editor</h3>
      <div className="flex flex-col gap-3">
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Active editor:{' '}
          <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
            {activeEditor}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => helpers.set('graphEditorId', 'scene-graph-v2')}
            className={`px-4 py-3 rounded-lg text-sm border-2 font-medium transition-all ${
              activeEditor === 'scene-graph-v2'
                ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600 hover:border-blue-400'
            }`}
          >
            Scene Graph
          </button>
          <button
            type="button"
            onClick={() => helpers.set('graphEditorId', 'arc-graph')}
            className={`px-4 py-3 rounded-lg text-sm border-2 font-medium transition-all ${
              activeEditor === 'arc-graph'
                ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600 hover:border-blue-400'
            }`}
          >
            Arc Graph
          </button>
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
          <p className="mb-1">
            <strong>Scene Graph:</strong> Traditional hierarchical node-based editor with comprehensive node types
          </p>
          <p>
            <strong>Arc Graph:</strong> Experimental arc-based flow editor with simplified UX
          </p>
        </div>
      </div>
    </div>
  );
}
