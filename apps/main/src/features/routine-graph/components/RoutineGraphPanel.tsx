/**
 * Routine Graph Panel
 *
 * Main panel component for the routine graph editor.
 * Integrates the graph surface with the node inspector.
 * Uses separate stores for data vs. selection.
 */

import { findNode } from '@pixsim7/shared.graph.utilities';
import { Undo2, Redo2 } from 'lucide-react';
import { useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';


import {
  useRoutineGraphStore,
  routineGraphSelectors,
  useRoutineGraphUndo,
  useRoutineGraphRedo,
} from '../stores/routineGraphStore';
import { useRoutineGraphSelectionStore } from '../stores/selectionStore';
import type { RoutineNode } from '../types';
import { formatTimeRange, getNodeTypeLabel } from '../types';

import RoutineGraphSurface from './RoutineGraphSurface';

// ============================================================================
// Node Inspector
// ============================================================================

function RoutineNodeInspector() {
  // Data store
  const currentGraph = useRoutineGraphStore(routineGraphSelectors.currentGraph);
  const updateNode = useRoutineGraphStore((s) => s.updateNode);
  const removeNode = useRoutineGraphStore((s) => s.removeNode);

  // Selection store
  const selectedNodeId = useRoutineGraphSelectionStore((s) => s.selectedNodeId);
  const clearSelection = useRoutineGraphSelectionStore((s) => s.clearSelection);

  // Get selected node from graph
  const selectedNode: RoutineNode | null = currentGraph && selectedNodeId
    ? findNode(currentGraph.nodes, selectedNodeId) ?? null
    : null;

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedNode) return;
      updateNode(selectedNode.id, { label: e.target.value });
    },
    [selectedNode, updateNode]
  );

  const handleTimeStartChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedNode?.timeRangeSeconds) return;
      const [hours, mins] = e.target.value.split(':').map(Number);
      const seconds = hours * 3600 + mins * 60;
      updateNode(selectedNode.id, {
        timeRangeSeconds: { ...selectedNode.timeRangeSeconds, start: seconds },
      });
    },
    [selectedNode, updateNode]
  );

  const handleTimeEndChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedNode?.timeRangeSeconds) return;
      const [hours, mins] = e.target.value.split(':').map(Number);
      const seconds = hours * 3600 + mins * 60;
      updateNode(selectedNode.id, {
        timeRangeSeconds: { ...selectedNode.timeRangeSeconds, end: seconds },
      });
    },
    [selectedNode, updateNode]
  );

  const handleDelete = useCallback(() => {
    if (!selectedNode) return;
    if (confirm(`Delete node "${selectedNode.label || selectedNode.id}"?`)) {
      removeNode(selectedNode.id);
      clearSelection();
    }
  }, [selectedNode, removeNode, clearSelection]);

  // Format seconds to HH:mm for input
  const formatSecondsToTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  if (!selectedNode) {
    return (
      <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400 text-center">
        Select a node to edit
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {getNodeTypeLabel(selectedNode.nodeType)}
        </span>
        <button
          onClick={handleDelete}
          className="px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
        >
          Delete
        </button>
      </div>

      {/* Label */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Label
        </label>
        <input
          type="text"
          value={selectedNode.label ?? ''}
          onChange={handleLabelChange}
          placeholder="Enter label..."
          className="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600
                     rounded bg-white dark:bg-neutral-700"
        />
      </div>

      {/* Time Range (for time_slot nodes) */}
      {selectedNode.nodeType === 'time_slot' && selectedNode.timeRangeSeconds && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Time Range
          </label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={formatSecondsToTime(selectedNode.timeRangeSeconds.start)}
              onChange={handleTimeStartChange}
              className="flex-1 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600
                         rounded bg-white dark:bg-neutral-700"
            />
            <span className="text-neutral-500">to</span>
            <input
              type="time"
              value={formatSecondsToTime(selectedNode.timeRangeSeconds.end)}
              onChange={handleTimeEndChange}
              className="flex-1 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600
                         rounded bg-white dark:bg-neutral-700"
            />
          </div>
          <div className="text-xs text-neutral-500">
            {formatTimeRange(selectedNode.timeRangeSeconds)}
          </div>
        </div>
      )}

      {/* Activities List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Preferred Activities
          </label>
          <button
            className="text-xs text-blue-600 hover:text-blue-700"
            onClick={() => {
              const activityId = prompt('Enter activity ID:');
              if (activityId) {
                updateNode(selectedNode.id, {
                  preferredActivities: [
                    ...(selectedNode.preferredActivities ?? []),
                    { activityId, weight: 1.0 },
                  ],
                });
              }
            }}
          >
            + Add
          </button>
        </div>

        {(selectedNode.preferredActivities?.length ?? 0) > 0 ? (
          <div className="space-y-1">
            {selectedNode.preferredActivities?.map((activity, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-neutral-50 dark:bg-neutral-700/50 rounded"
              >
                <span className="text-sm">{activity.activityId}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={activity.weight}
                    onChange={(e) => {
                      const newActivities = [...(selectedNode.preferredActivities ?? [])];
                      newActivities[idx] = { ...activity, weight: parseFloat(e.target.value) || 1 };
                      updateNode(selectedNode.id, { preferredActivities: newActivities });
                    }}
                    step="0.1"
                    min="0"
                    max="10"
                    className="w-16 px-1 py-0.5 text-xs text-center border rounded"
                  />
                  <button
                    onClick={() => {
                      const newActivities = selectedNode.preferredActivities?.filter((_, i) => i !== idx);
                      updateNode(selectedNode.id, { preferredActivities: newActivities });
                    }}
                    className="text-red-500 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-neutral-400 italic p-2 bg-neutral-50 dark:bg-neutral-700/30 rounded">
            No activities assigned
          </div>
        )}
      </div>

      {/* Conditions (for decision nodes) */}
      {selectedNode.nodeType === 'decision' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Decision Conditions
            </label>
            <button
              className="text-xs text-blue-600 hover:text-blue-700"
              onClick={() => {
                alert('Condition editor coming soon');
              }}
            >
              + Add
            </button>
          </div>

          {(selectedNode.decisionConditions?.length ?? 0) > 0 ? (
            <div className="space-y-1">
              {selectedNode.decisionConditions?.map((cond, idx) => (
                <div
                  key={idx}
                  className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs"
                >
                  {cond.type}: {JSON.stringify(cond)}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-neutral-400 italic p-2 bg-neutral-50 dark:bg-neutral-700/30 rounded">
              No conditions (always active)
            </div>
          )}
        </div>
      )}

      {/* Node ID (read-only) */}
      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <div className="text-[10px] text-neutral-400">
          ID: {selectedNode.id}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Undo/Redo Toolbar
// ============================================================================

function UndoRedoToolbar() {
  const undo = useRoutineGraphUndo();
  const redo = useRoutineGraphRedo();
  const canUndo = routineGraphSelectors.canUndo();
  const canRedo = routineGraphSelectors.canRedo();

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => undo?.()}
        disabled={!canUndo}
        className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={14} />
      </button>
      <button
        onClick={() => redo?.()}
        disabled={!canRedo}
        className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={14} />
      </button>
    </div>
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export function RoutineGraphPanel() {
  const currentGraph = useRoutineGraphStore(routineGraphSelectors.currentGraph);
  const isDirty = useRoutineGraphStore(routineGraphSelectors.isDirty);

  return (
    <div className="flex h-full bg-neutral-50 dark:bg-neutral-900">
      {/* Graph Surface */}
      <div className="flex-1 h-full">
        <ReactFlowProvider>
          <RoutineGraphSurface />
        </ReactFlowProvider>
      </div>

      {/* Right Sidebar: Inspector */}
      <div className="w-72 h-full border-l border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-y-auto">
        {/* Graph Info Header */}
        {currentGraph && (
          <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Routine
              </span>
              <div className="flex items-center gap-2">
                <UndoRedoToolbar />
                {isDirty && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                    Unsaved
                  </span>
                )}
              </div>
            </div>
            <div className="text-sm font-medium">{currentGraph.name}</div>
            <div className="text-xs text-neutral-500">
              {currentGraph.nodes.length} nodes · {currentGraph.edges.length} edges
            </div>
          </div>
        )}

        {/* Node Inspector */}
        <RoutineNodeInspector />
      </div>
    </div>
  );
}

export default RoutineGraphPanel;
