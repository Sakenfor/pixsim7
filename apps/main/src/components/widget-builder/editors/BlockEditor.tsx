/**
 * BlockEditor
 *
 * Editor for panel-composer block widgets with grid-based positioning.
 * Supports drag-and-drop widget placement, grid configuration, and undo/redo.
 */

import { Panel } from '@pixsim7/shared.ui';
import { useState } from 'react';

import { useUndoRedo } from '@lib/editing-core';
import { Icon } from '@lib/icons';
import {
  widgetRegistry,
  blockWidgets,
  type WidgetDefinition,
  type WidgetInstance,
} from '@lib/widgets';

import { SurfaceWorkbench } from '@/components/surface-workbench';

export interface BlockEditorProps {
  instances: WidgetInstance[];
  onInstancesChange: (instances: WidgetInstance[]) => void;
}

export function BlockEditor({ instances: initialInstances, onInstancesChange }: BlockEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const availableWidgets = blockWidgets.getAll();

  // Undo/redo support
  const history = useUndoRedo<WidgetInstance[]>(initialInstances);
  const instances = history.value;

  // Sync changes to parent
  const updateInstances = (newInstances: WidgetInstance[]) => {
    history.set(newInstances);
    onInstancesChange(newInstances);
  };

  const selectedInstance = instances.find((i) => i.id === selectedId);

  const handleAddWidget = (widget: WidgetDefinition) => {
    const newInstance: WidgetInstance = {
      id: `${widget.id}-${Date.now()}`,
      widgetId: widget.id,
      surface: 'panel-composer',
      placement: { grid: { x: 0, y: instances.length, w: 2, h: 2 } },
      settings: widget.defaultSettings,
    };
    updateInstances([...instances, newInstance]);
    setSelectedId(newInstance.id);
  };

  const handleRemove = (id: string) => {
    updateInstances(instances.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdatePlacement = (id: string, grid: { x: number; y: number; w: number; h: number }) => {
    updateInstances(
      instances.map((i) => (i.id === id ? { ...i, placement: { ...i.placement, grid } } : i))
    );
  };

  const handleUndo = () => {
    history.undo();
    onInstancesChange(history.value);
  };

  const handleRedo = () => {
    history.redo();
    onInstancesChange(history.value);
  };

  const sidebar = (
    <div className="space-y-4">
      {/* Widget Palette */}
      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Available Blocks</h3>
        <div className="space-y-1">
          {availableWidgets.map((widget) => (
            <button
              key={widget.id}
              onClick={() => handleAddWidget(widget)}
              className="w-full px-3 py-2 text-left text-sm rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <Icon name={widget.icon || '◻️'} size={16} />
              <span>{widget.title}</span>
            </button>
          ))}
          {availableWidgets.length === 0 && (
            <p className="text-sm text-neutral-500 py-2">No block widgets registered</p>
          )}
        </div>
      </Panel>

      {/* Instance List */}
      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Instances ({instances.length})</h3>
        <div className="space-y-1">
          {instances.map((instance) => {
            const def = widgetRegistry.get(instance.widgetId);
            return (
              <div
                key={instance.id}
                onClick={() => setSelectedId(instance.id)}
                className={`px-3 py-2 rounded cursor-pointer flex items-center gap-2 ${
                  selectedId === instance.id
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
              >
                <Icon name={def?.icon || '◻️'} size={16} />
                <span className="flex-1 text-sm truncate">{def?.title || instance.widgetId}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(instance.id);
                  }}
                  className="text-neutral-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );

  const preview = (
    <Panel className="h-full">
      <h3 className="text-sm font-semibold mb-4">Grid Preview</h3>
      <div
        className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 min-h-[300px]"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridAutoRows: '80px',
          gap: '8px',
        }}
      >
        {instances.map((instance) => {
          const def = widgetRegistry.get(instance.widgetId);
          const grid = instance.placement.grid || { x: 0, y: 0, w: 1, h: 1 };
          return (
            <div
              key={instance.id}
              onClick={() => setSelectedId(instance.id)}
              className={`bg-white dark:bg-neutral-700 rounded border-2 flex items-center justify-center cursor-pointer ${
                selectedId === instance.id
                  ? 'border-blue-500'
                  : 'border-neutral-300 dark:border-neutral-600'
              }`}
              style={{
                gridColumn: `${grid.x + 1} / span ${grid.w}`,
                gridRow: `${grid.y + 1} / span ${grid.h}`,
              }}
            >
              <div className="text-center">
                <div className="text-2xl">{def?.icon || '◻️'}</div>
                <div className="text-xs text-neutral-500 mt-1">{def?.title}</div>
              </div>
            </div>
          );
        })}
        {instances.length === 0 && (
          <div className="col-span-4 row-span-3 flex items-center justify-center text-neutral-400">
            Add blocks from the palette
          </div>
        )}
      </div>
    </Panel>
  );

  const inspector = selectedInstance ? (
    <Panel className="space-y-4">
      <h3 className="text-sm font-semibold">Grid Position</h3>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Column (X)</label>
          <input
            type="number"
            min={0}
            value={selectedInstance.placement.grid?.x || 0}
            onChange={(e) =>
              handleUpdatePlacement(selectedInstance.id, {
                ...selectedInstance.placement.grid!,
                x: parseInt(e.target.value) || 0,
              })
            }
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Row (Y)</label>
          <input
            type="number"
            min={0}
            value={selectedInstance.placement.grid?.y || 0}
            onChange={(e) =>
              handleUpdatePlacement(selectedInstance.id, {
                ...selectedInstance.placement.grid!,
                y: parseInt(e.target.value) || 0,
              })
            }
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Width</label>
          <input
            type="number"
            min={1}
            value={selectedInstance.placement.grid?.w || 1}
            onChange={(e) =>
              handleUpdatePlacement(selectedInstance.id, {
                ...selectedInstance.placement.grid!,
                w: parseInt(e.target.value) || 1,
              })
            }
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Height</label>
          <input
            type="number"
            min={1}
            value={selectedInstance.placement.grid?.h || 1}
            onChange={(e) =>
              handleUpdatePlacement(selectedInstance.id, {
                ...selectedInstance.placement.grid!,
                h: parseInt(e.target.value) || 1,
              })
            }
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
          />
        </div>
      </div>
    </Panel>
  ) : (
    <Panel className="h-full flex items-center justify-center">
      <p className="text-sm text-neutral-500">Select a block to edit</p>
    </Panel>
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      <button
        onClick={handleUndo}
        disabled={!history.canUndo}
        className={`px-2 py-1 text-sm rounded ${
          history.canUndo
            ? 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
        }`}
        title="Undo (Ctrl+Z)"
      >
        ↩ Undo
      </button>
      <button
        onClick={handleRedo}
        disabled={!history.canRedo}
        className={`px-2 py-1 text-sm rounded ${
          history.canRedo
            ? 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
        }`}
        title="Redo (Ctrl+Y)"
      >
        ↪ Redo
      </button>
    </div>
  );

  return (
    <SurfaceWorkbench
      title="Block Editor"
      description={`${instances.length} blocks`}
      headerActions={headerActions}
      sidebar={sidebar}
      preview={preview}
      inspector={inspector}
    />
  );
}
