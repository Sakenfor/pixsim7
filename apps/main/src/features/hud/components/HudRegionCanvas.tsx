/**
 * HUD Region Canvas
 *
 * Part of Task 58 Phase 58.2 - HUD Builder Panel
 *
 * Editing canvas for a specific HUD region.
 * Reuses ComposedPanel for rendering and allows widget management.
 */

import { useState } from 'react';
import { useHudLayoutStore } from '../stores/hudLayoutStore';
import { ComposedPanel } from '@/components/panels/shared/ComposedPanel';
import { createComposition } from '@lib/ui/composer/panelComposer';
import type { HudRegionId, HudRegionLayout } from '@features/hud/lib/core/types';

export interface HudRegionCanvasProps {
  layoutId: string;
  region: HudRegionId;
  regionLayout?: HudRegionLayout;
}

export function HudRegionCanvas({ layoutId, region, regionLayout }: HudRegionCanvasProps) {
  const store = useHudLayoutStore();
  const [showGrid, setShowGrid] = useState(true);

  const handleCreateRegion = () => {
    const composition = createComposition(
      `${region}-composition`,
      `${region.charAt(0).toUpperCase() + region.slice(1)} Region`,
      12, // columns
      region === 'top' || region === 'bottom' ? 2 : 8 // rows
    );

    const newRegion: HudRegionLayout = {
      region,
      composition,
      enabled: true,
    };

    store.addRegion(layoutId, newRegion);
  };

  const handleToggleEnabled = () => {
    if (!regionLayout) return;
    store.updateRegion(layoutId, region, { enabled: !regionLayout.enabled });
  };

  const handleRemoveWidget = (widgetId: string) => {
    if (!regionLayout) return;
    const updatedComposition = {
      ...regionLayout.composition,
      widgets: regionLayout.composition.widgets.filter((w) => w.id !== widgetId),
    };
    store.updateRegion(layoutId, region, { composition: updatedComposition });
  };

  if (!regionLayout) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white dark:bg-neutral-900 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700">
        <div className="text-center">
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            No layout for {region} region
          </p>
          <button
            onClick={handleCreateRegion}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Create {region.charAt(0).toUpperCase() + region.slice(1)} Region
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-3 py-1.5 rounded text-sm ${
              showGrid
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100'
            }`}
          >
            Grid
          </button>
          <button
            onClick={handleToggleEnabled}
            className={`px-3 py-1.5 rounded text-sm ${
              regionLayout.enabled
                ? 'bg-green-600 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100'
            }`}
          >
            {regionLayout.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {regionLayout.composition.widgets.length} widgets
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative bg-neutral-100 dark:bg-neutral-950 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)
              `,
              backgroundSize: `${100 / regionLayout.composition.layout.columns}% ${100 / regionLayout.composition.layout.rows}%`,
            }}
          />
        )}

        <div className="h-full w-full relative">
          <ComposedPanel composition={regionLayout.composition} />

          {/* Widget Overlays for editing */}
          {regionLayout.composition.widgets.map((widget) => (
            <div
              key={widget.id}
              className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-auto group hover:bg-blue-500/20 transition-colors"
              style={{
                left: `${(widget.position.x / regionLayout.composition.layout.columns) * 100}%`,
                top: `${(widget.position.y / regionLayout.composition.layout.rows) * 100}%`,
                width: `${(widget.position.w / regionLayout.composition.layout.columns) * 100}%`,
                height: `${(widget.position.h / regionLayout.composition.layout.rows) * 100}%`,
              }}
            >
              <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleRemoveWidget(widget.id)}
                  className="bg-red-600 text-white text-xs px-2 py-1 rounded-bl"
                  title="Remove widget"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Widget List */}
      {regionLayout.composition.widgets.length > 0 && (
        <div className="flex-shrink-0 mt-3 p-3 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800">
          <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
            Widgets in this region:
          </h4>
          <div className="space-y-1">
            {regionLayout.composition.widgets.map((widget) => (
              <div
                key={widget.id}
                className="flex items-center justify-between text-xs p-2 bg-neutral-50 dark:bg-neutral-800 rounded"
              >
                <span className="text-neutral-900 dark:text-neutral-100">
                  {widget.widgetType} ({widget.position.x},{widget.position.y}) {widget.position.w}×{widget.position.h}
                </span>
                <button
                  onClick={() => handleRemoveWidget(widget.id)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
