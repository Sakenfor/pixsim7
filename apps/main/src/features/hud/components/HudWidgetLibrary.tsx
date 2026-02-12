/**
 * HUD Widget Library
 *
 * Part of Task 58 Phase 58.2 - HUD Builder Panel
 *
 * Browse and add widgets from the unified widget registry to HUD regions.
 * Uses blockWidgets view which filters for panel-composer capable widgets.
 */

import { useState } from 'react';

import { Icon } from '@lib/icons';
import { addWidget } from '@lib/ui/composer';
import { blockWidgets } from '@lib/widgets';
import type { WidgetDefinition } from '@lib/widgets';

import type { HudRegionId } from '@features/hud';


import { useHudLayoutStore } from '../stores/hudLayoutStore';

export interface HudWidgetLibraryProps {
  layoutId: string;
  selectedRegion: HudRegionId;
}

/** Get panel-composer specific config for a widget */
function getPanelComposerConfig(widget: WidgetDefinition) {
  const config = widget.surfaceConfig?.panelComposer;
  return {
    defaultWidth: config?.defaultWidth ?? 2,
    defaultHeight: config?.defaultHeight ?? 2,
    minWidth: config?.minWidth ?? 1,
    minHeight: config?.minHeight ?? 1,
  };
}

export function HudWidgetLibrary({ layoutId, selectedRegion }: HudWidgetLibraryProps) {
  const store = useHudLayoutStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const widgets = blockWidgets.getAll();
  const filteredWidgets = widgets.filter((widget) => {
    const matchesSearch =
      searchQuery === '' ||
      widget.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      widget.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || widget.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleAddWidget = (widgetType: string) => {
    const layout = store.getLayout(layoutId);
    if (!layout) return;

    const regionLayout = layout.regions.find((r) => r.region === selectedRegion);
    if (!regionLayout) {
      alert(`Please create the ${selectedRegion} region first`);
      return;
    }

    // Find next available position in grid
    const { composition } = regionLayout;
    const widgetDef = blockWidgets.get(widgetType);
    const panelConfig = widgetDef ? getPanelComposerConfig(widgetDef) : { defaultWidth: 2, defaultHeight: 2 };
    const defaultWidth = panelConfig.defaultWidth;
    const defaultHeight = panelConfig.defaultHeight;

    // Simple placement: try to place at next available row
    let x = 0;
    let y = 0;
    const occupied = new Set<string>();

    composition.widgets.forEach((w) => {
      for (let cx = w.position.x; cx < w.position.x + w.position.w; cx++) {
        for (let cy = w.position.y; cy < w.position.y + w.position.h; cy++) {
          occupied.add(`${cx},${cy}`);
        }
      }
    });

    // Find first available position
    let found = false;
    for (let row = 0; row < composition.layout.rows && !found; row++) {
      for (let col = 0; col < composition.layout.columns && !found; col++) {
        // Check if widget fits here
        let fits = true;
        for (let dx = 0; dx < defaultWidth && fits; dx++) {
          for (let dy = 0; dy < defaultHeight && fits; dy++) {
            if (
              col + dx >= composition.layout.columns ||
              row + dy >= composition.layout.rows ||
              occupied.has(`${col + dx},${row + dy}`)
            ) {
              fits = false;
            }
          }
        }

        if (fits) {
          x = col;
          y = row;
          found = true;
        }
      }
    }

    if (!found) {
      alert('No space available in this region. Remove some widgets or adjust the grid.');
      return;
    }

    const updatedComposition = addWidget(
      composition,
      widgetType,
      { x, y, w: defaultWidth, h: defaultHeight },
      widgetDef?.defaultSettings || {}
    );

    store.updateRegion(layoutId, selectedRegion, { composition: updatedComposition });
  };

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'display', label: 'Display' },
    { id: 'input', label: 'Input' },
    { id: 'visualization', label: 'Visualization' },
    { id: 'layout', label: 'Layout' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-neutral-200 dark:border-neutral-800">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
          Widget Library
        </h3>

        {/* Search */}
        <input
          type="text"
          placeholder="Search widgets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded text-sm mb-3"
        />

        {/* Category Filter */}
        <div className="flex flex-wrap gap-1">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-2 py-1 rounded text-xs ${
                selectedCategory === category.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* Widget List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredWidgets.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center py-4">
            No widgets found
          </p>
        ) : (
          filteredWidgets.map((widget) => (
            <button
              key={widget.id}
              onClick={() => handleAddWidget(widget.id)}
              className="w-full text-left p-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded hover:border-blue-500 dark:hover:border-blue-500 hover:shadow transition-all"
            >
              <div className="flex items-start justify-between mb-1">
                <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                  {widget.icon && <Icon name={widget.icon} size={14} className="mr-1" />}
                  {widget.title}
                </div>
                <span className="text-xs px-2 py-0.5 bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 rounded">
                  {widget.category}
                </span>
              </div>
              {widget.description && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                  {widget.description}
                </p>
              )}
              <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                {getPanelComposerConfig(widget).defaultWidth}×{getPanelComposerConfig(widget).defaultHeight} grid units
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
