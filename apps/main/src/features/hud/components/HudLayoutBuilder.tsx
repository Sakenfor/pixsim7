/**
 * HUD Layout Builder
 *
 * Part of Task 58 Phase 58.2 - HUD Builder Panel
 *
 * Main panel for designing HUD layouts using the widget composition system.
 * Reuses ComposedPanel renderer and widget registry from Task 50.
 */

import { useState, useEffect } from 'react';
import { useHudLayoutStore } from '../stores/hudLayoutStore';
import { HudRegionSelector } from './HudRegionSelector';
import { HudRegionCanvas } from './HudRegionCanvas';
import { HudWidgetLibrary } from './HudWidgetLibrary';
import { HudLayoutManager } from './HudLayoutManager';
import type { HudRegionId, HudRegionLayout } from '@features/hud/types';
import type { WorldHudLayout } from '@features/hud/types';

export interface HudLayoutBuilderProps {
  worldId: number | string;
}

export function HudLayoutBuilder({ worldId }: HudLayoutBuilderProps) {
  const store = useHudLayoutStore();
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<HudRegionId>('top');
  const [activeLayout, setActiveLayout] = useState<WorldHudLayout | null>(null);

  // Load layouts for world
  useEffect(() => {
    const layouts = store.getLayoutsForWorld(worldId);
    if (layouts.length > 0) {
      const defaultLayout = layouts.find((l) => l.isDefault) || layouts[0];
      setSelectedLayoutId(defaultLayout.id);
      setActiveLayout(defaultLayout);
    } else {
      // Create default layout if none exists
      const newLayout = store.createLayout(worldId, `HUD Layout for World ${worldId}`);
      setSelectedLayoutId(newLayout.id);
      setActiveLayout(newLayout);
    }
  }, [worldId, store]);

  // Update active layout when selection changes
  useEffect(() => {
    if (selectedLayoutId) {
      const layout = store.getLayout(selectedLayoutId);
      if (layout) {
        setActiveLayout(layout);
      }
    }
  }, [selectedLayoutId, store]);

  const currentRegionLayout = activeLayout?.regions.find((r) => r.region === selectedRegion);

  const handleLayoutSelect = (layoutId: string) => {
    setSelectedLayoutId(layoutId);
  };

  const handleNewLayout = () => {
    const newLayout = store.createLayout(worldId, `New HUD Layout ${Date.now()}`);
    setSelectedLayoutId(newLayout.id);
  };

  const handleRegionChange = (region: HudRegionId) => {
    setSelectedRegion(region);
  };

  if (!activeLayout) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="text-center">
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">No HUD layout found</p>
          <button
            onClick={handleNewLayout}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Create HUD Layout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            HUD Layout Builder
          </h2>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            World ID: {worldId}
          </div>
        </div>

        <HudLayoutManager
          worldId={worldId}
          selectedLayoutId={selectedLayoutId}
          onLayoutSelect={handleLayoutSelect}
          onNewLayout={handleNewLayout}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar - Widget Library */}
        <div className="w-64 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-y-auto">
          <HudWidgetLibrary
            layoutId={activeLayout.id}
            selectedRegion={selectedRegion}
          />
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Region Selector */}
          <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
            <HudRegionSelector
              selectedRegion={selectedRegion}
              onRegionChange={handleRegionChange}
              layout={activeLayout}
            />
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto p-4">
            <HudRegionCanvas
              layoutId={activeLayout.id}
              region={selectedRegion}
              regionLayout={currentRegionLayout}
            />
          </div>
        </div>

        {/* Right Sidebar - Region Info */}
        <div className="w-64 border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
            Region: {selectedRegion}
          </h3>
          {currentRegionLayout ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">Status</p>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {currentRegionLayout.enabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">Widgets</p>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {currentRegionLayout.composition.widgets.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">Grid</p>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {currentRegionLayout.composition.layout.columns} × {currentRegionLayout.composition.layout.rows}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No layout for this region yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
