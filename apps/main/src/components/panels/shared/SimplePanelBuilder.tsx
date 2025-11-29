/**
 * Simple Panel Builder
 *
 * Simplified UI for creating composed panels.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 * Integrated with Task 51 data binding system for live data.
 */

import { useState } from 'react';
import { widgetRegistry } from '@/lib/widgets/widgetRegistry';
import {
  createComposition,
  addWidget,
  exportComposition,
  importComposition,
  type PanelComposition,
} from '@/lib/widgets/panelComposer';
import { ComposedPanel } from './ComposedPanel';
import {
  demoCompositions,
  getDemoComposition,
  getDemoCompositionIds,
} from '@/lib/widgets/demoCompositions';

export function SimplePanelBuilder() {
  const [composition, setComposition] = useState<PanelComposition>(() =>
    createComposition('demo-panel', 'Demo Panel', 12, 8)
  );
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showDemoPicker, setShowDemoPicker] = useState(false);

  const widgets = widgetRegistry.getAll();

  const handleAddWidget = (widgetType: string) => {
    // Find empty space in the grid
    const occupied = new Set<string>();
    composition.widgets.forEach((w) => {
      for (let x = w.position.x; x < w.position.x + w.position.w; x++) {
        for (let y = w.position.y; y < w.position.y + w.position.h; y++) {
          occupied.add(`${x},${y}`);
        }
      }
    });

    // Find first available position
    let foundPosition = null;
    for (let y = 0; y < composition.layout.rows; y++) {
      for (let x = 0; x < composition.layout.columns; x++) {
        if (!occupied.has(`${x},${y}`)) {
          const widgetDef = widgetRegistry.get(widgetType);
          const w = widgetDef?.defaultWidth || 2;
          const h = widgetDef?.defaultHeight || 2;

          // Check if widget fits
          let fits = true;
          for (let wx = x; wx < x + w && wx < composition.layout.columns; wx++) {
            for (let wy = y; wy < y + h && wy < composition.layout.rows; wy++) {
              if (occupied.has(`${wx},${wy}`)) {
                fits = false;
                break;
              }
            }
            if (!fits) break;
          }

          if (fits) {
            foundPosition = { x, y, w, h };
            break;
          }
        }
      }
      if (foundPosition) break;
    }

    if (!foundPosition) {
      alert('No space available in the grid');
      return;
    }

    const widgetDef = widgetRegistry.get(widgetType);
    const newComposition = addWidget(
      composition,
      widgetType,
      foundPosition,
      widgetDef?.defaultConfig || {}
    );

    setComposition(newComposition);
  };

  const handleExport = () => {
    const json = exportComposition(composition);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${composition.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const json = e.target?.result as string;
          const imported = importComposition(json);
          if (imported) {
            setComposition(imported);
          } else {
            alert('Failed to import composition');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleLoadDemo = (demoId: string) => {
    const demo = getDemoComposition(demoId);
    if (demo) {
      setComposition(demo);
      setShowDemoPicker(false);
      setShowPreview(true); // Switch to preview to see the demo in action
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold">Panel Builder</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Create custom panels from widgets
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDemoPicker(!showDemoPicker)}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm transition-colors"
            >
              Load Demo
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={handleImport}
              className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded text-sm transition-colors"
            >
              Import
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded text-sm transition-colors"
            >
              Export
            </button>
          </div>
        </div>

        {/* Composition Info */}
        <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
          <span>
            <strong>Name:</strong> {composition.name}
          </span>
          <span>
            <strong>Grid:</strong> {composition.layout.columns}x{composition.layout.rows}
          </span>
          <span>
            <strong>Widgets:</strong> {composition.widgets.length}
          </span>
          {composition.widgets.some(w => w.dataBindings && Object.keys(w.dataBindings).length > 0) && (
            <span className="text-green-600 dark:text-green-400">
              ✓ Data Bindings Active
            </span>
          )}
        </div>
      </div>

      {/* Demo Picker */}
      {showDemoPicker && (
        <div className="border-b border-neutral-200 dark:border-neutral-700 p-4 bg-green-50 dark:bg-green-900/10">
          <h3 className="text-sm font-semibold mb-3">Demo Compositions with Data Binding</h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3">
            These demos showcase the Task 51 data binding system integrated with Panel Builder widgets.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleLoadDemo('demo-workspace-status')}
              className="p-3 bg-white dark:bg-neutral-800 rounded-lg border-2 border-green-500 hover:border-green-600 transition-colors text-left"
            >
              <div className="font-medium text-sm mb-1">Workspace Status Dashboard</div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                Displays workspace lock status, panel counts, and lists with live data from workspace store.
              </div>
            </button>
            <button
              onClick={() => handleLoadDemo('demo-game-state')}
              className="p-3 bg-white dark:bg-neutral-800 rounded-lg border-2 border-green-500 hover:border-green-600 transition-colors text-left"
            >
              <div className="font-medium text-sm mb-1">Game State Monitor</div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                Shows game mode, world ID, session ID, and full context with transforms applied.
              </div>
            </button>
            <button
              onClick={() => handleLoadDemo('demo-mixed-data')}
              className="p-3 bg-white dark:bg-neutral-800 rounded-lg border-2 border-green-500 hover:border-green-600 transition-colors text-left"
            >
              <div className="font-medium text-sm mb-1">Mixed Data Dashboard</div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                Combines workspace and game state data in a single organized panel.
              </div>
            </button>
          </div>
        </div>
      )}

      {showPreview ? (
        /* Preview Mode */
        <div className="flex-1 overflow-auto">
          <ComposedPanel composition={composition} />
        </div>
      ) : (
        /* Edit Mode */
        <div className="flex-1 flex">
          {/* Widget Library */}
          <div className="w-64 border-r border-neutral-200 dark:border-neutral-700 p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold mb-3">Available Widgets</h3>
            <div className="space-y-2">
              {widgets.map((widget) => (
                <button
                  key={widget.id}
                  onClick={() => handleAddWidget(widget.id)}
                  className="w-full text-left p-3 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {widget.icon && <span>{widget.icon}</span>}
                    <span className="text-sm font-medium">{widget.title}</span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {widget.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto p-4">
            <div className="bg-neutral-50 dark:bg-neutral-950 rounded-lg p-4 h-full">
              <ComposedPanel composition={composition} />
            </div>
          </div>

          {/* Widget List */}
          <div className="w-64 border-l border-neutral-200 dark:border-neutral-700 p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold mb-3">
              Widgets ({composition.widgets.length})
            </h3>
            <div className="space-y-2">
              {composition.widgets.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No widgets yet. Add widgets from the library.
                </p>
              ) : (
                composition.widgets.map((widget) => {
                  const widgetDef = widgetRegistry.get(widget.widgetType);
                  return (
                    <div
                      key={widget.id}
                      className="p-2 rounded bg-neutral-100 dark:bg-neutral-800"
                    >
                      <div className="text-sm font-medium flex items-center gap-2">
                        {widgetDef?.icon} {widgetDef?.title || widget.widgetType}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        Position: ({widget.position.x}, {widget.position.y})
                        <br />
                        Size: {widget.position.w}x{widget.position.h}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
