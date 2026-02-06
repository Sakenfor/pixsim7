/**
 * ChromeEditor
 *
 * Editor for header/statusbar/toolbar chrome widgets with area-based positioning.
 * Widgets can be placed in left, center, or right areas with configurable order.
 */

import { Panel } from '@pixsim7/shared.ui';
import { useState } from 'react';

import { useUndoRedo } from '@lib/editing-core';
import {
  widgetRegistry,
  chromeWidgets,
  type WidgetDefinition,
  type WidgetInstance,
} from '@lib/widgets';

import { SurfaceWorkbench } from '@/components/surface-workbench';

export interface ChromeEditorProps {
  instances: WidgetInstance[];
  onInstancesChange: (instances: WidgetInstance[]) => void;
}

export function ChromeEditor({ instances: initialInstances, onInstancesChange }: ChromeEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const availableWidgets = chromeWidgets.getAll();

  // Undo/redo support
  const history = useUndoRedo<WidgetInstance[]>(initialInstances);
  const instances = history.value;

  // Sync changes to parent
  const updateInstances = (newInstances: WidgetInstance[]) => {
    history.set(newInstances);
    onInstancesChange(newInstances);
  };

  const selectedInstance = instances.find((i) => i.id === selectedId);

  const handleAddWidget = (widget: WidgetDefinition, area: string) => {
    const areaInstances = instances.filter((i) => i.placement.area === area);
    const newInstance: WidgetInstance = {
      id: `${widget.id}-${Date.now()}`,
      widgetId: widget.id,
      surface: 'header',
      placement: { area, order: areaInstances.length },
      settings: widget.defaultSettings,
    };
    updateInstances([...instances, newInstance]);
    setSelectedId(newInstance.id);
  };

  const handleRemove = (id: string) => {
    updateInstances(instances.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdatePlacement = (id: string, area: string, order: number) => {
    updateInstances(
      instances.map((i) => (i.id === id ? { ...i, placement: { area, order } } : i))
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

  const getInstancesForArea = (area: string) =>
    instances
      .filter((i) => i.placement.area === area)
      .sort((a, b) => (a.placement.order || 0) - (b.placement.order || 0));

  const sidebar = (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Available Widgets</h3>
        <div className="space-y-1">
          {availableWidgets.map((widget) => (
            <div key={widget.id} className="flex items-center gap-2">
              <span className="w-6 text-center">{widget.icon || '◻️'}</span>
              <span className="flex-1 text-sm">{widget.title}</span>
              <div className="flex gap-1">
                {['left', 'center', 'right'].map((area) => (
                  <button
                    key={area}
                    onClick={() => handleAddWidget(widget, area)}
                    className="px-2 py-1 text-xs bg-neutral-200 dark:bg-neutral-700 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
                    title={`Add to ${area}`}
                  >
                    {area[0].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {availableWidgets.length === 0 && (
            <p className="text-sm text-neutral-500 py-2">No chrome widgets registered</p>
          )}
        </div>
      </Panel>

      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Instances ({instances.length})</h3>
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
              <span>{def?.icon || '◻️'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{def?.title}</div>
                <div className="text-xs text-neutral-500">{instance.placement.area}</div>
              </div>
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
      </Panel>
    </div>
  );

  const preview = (
    <Panel className="h-full">
      <h3 className="text-sm font-semibold mb-4">Header Preview</h3>
      <div className="bg-neutral-800 text-white rounded-lg p-2">
        <div className="flex items-center justify-between h-10">
          {['left', 'center', 'right'].map((area) => (
            <div
              key={area}
              className={`flex items-center gap-2 ${area === 'center' ? 'flex-1 justify-center' : ''}`}
            >
              {getInstancesForArea(area).map((instance) => {
                const def = widgetRegistry.get(instance.widgetId);
                return (
                  <div
                    key={instance.id}
                    onClick={() => setSelectedId(instance.id)}
                    className={`px-3 py-1 rounded cursor-pointer ${
                      selectedId === instance.id
                        ? 'bg-blue-500'
                        : 'bg-neutral-700 hover:bg-neutral-600'
                    }`}
                  >
                    <span className="mr-1">{def?.icon}</span>
                    <span className="text-sm">{def?.title}</span>
                  </div>
                );
              })}
              {getInstancesForArea(area).length === 0 && (
                <span className="text-xs text-neutral-500">{area}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );

  const inspector = selectedInstance ? (
    <Panel className="space-y-4">
      <h3 className="text-sm font-semibold">Placement</h3>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Area</label>
        <select
          value={selectedInstance.placement.area || 'right'}
          onChange={(e) =>
            handleUpdatePlacement(
              selectedInstance.id,
              e.target.value,
              selectedInstance.placement.order || 0
            )
          }
          className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Order</label>
        <input
          type="number"
          min={0}
          value={selectedInstance.placement.order || 0}
          onChange={(e) =>
            handleUpdatePlacement(
              selectedInstance.id,
              selectedInstance.placement.area || 'right',
              parseInt(e.target.value) || 0
            )
          }
          className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
        />
      </div>
    </Panel>
  ) : (
    <Panel className="h-full flex items-center justify-center">
      <p className="text-sm text-neutral-500">Select a widget to edit</p>
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
      title="Chrome Editor"
      description={`${instances.length} widgets`}
      headerActions={headerActions}
      sidebar={sidebar}
      preview={preview}
      inspector={inspector}
    />
  );
}
