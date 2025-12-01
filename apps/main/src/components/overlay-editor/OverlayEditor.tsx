/**
 * OverlayEditor Component
 *
 * Generic visual editor for overlay positioning system configurations.
 * Can be used for MediaCard badges, video controls, HUD overlays, etc.
 */

import React, { useState, useMemo } from 'react';
import type { OverlayConfiguration, OverlayWidget } from '@/lib/overlay';
import { Panel, Button } from '@pixsim7/shared.ui';
import { WidgetList } from './WidgetList';
import { WidgetPropertyEditor } from './WidgetPropertyEditor';
import { PresetSelector } from './PresetSelector';
import { ValidationPanel } from './ValidationPanel';
import { getWidget, createWidget } from '@/lib/editing-core/registry/widgetRegistry';
import type { UnifiedWidgetConfig } from '@/lib/editing-core';

export interface OverlayEditorProps {
  /** Current overlay configuration */
  configuration: OverlayConfiguration;

  /** Callback when configuration changes */
  onChange: (config: OverlayConfiguration) => void;

  /** Optional preview component to show live changes */
  preview?: React.ReactNode;

  /** Available presets for this configuration type */
  presets?: Array<{
    id: string;
    name: string;
    icon?: string;
    configuration: OverlayConfiguration;
  }>;

  /** Callback when preset is selected */
  onPresetSelect?: (presetId: string) => void;

  /** Optional custom widget types for this editor */
  availableWidgetTypes?: Array<{
    type: string;
    name: string;
    icon?: string;
    defaultConfig?: Partial<OverlayWidget>;
  }>;
}

/**
 * Main overlay configuration editor
 */
export function OverlayEditor({
  configuration,
  onChange,
  preview,
  presets = [],
  onPresetSelect,
  availableWidgetTypes = [],
}: OverlayEditorProps) {
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

  // Find selected widget
  const selectedWidget = useMemo(() => {
    if (!selectedWidgetId) return null;
    return configuration.widgets.find((w) => w.id === selectedWidgetId) ?? null;
  }, [selectedWidgetId, configuration.widgets]);

  // Handle widget selection
  const handleSelectWidget = (widgetId: string) => {
    setSelectedWidgetId(widgetId);
  };

  // Handle widget updates
  const handleUpdateWidget = (widgetId: string, updates: Partial<OverlayWidget>) => {
    const updatedWidgets = configuration.widgets.map((widget) =>
      widget.id === widgetId ? { ...widget, ...updates } : widget
    );

    onChange({
      ...configuration,
      widgets: updatedWidgets,
    });
  };

  // Handle widget addition
  const handleAddWidget = (widgetType: string) => {
    // Try to get default config from widget registry
    const widgetDef = getWidget(widgetType);
    let defaultWidget: OverlayWidget;

    if (widgetDef?.defaultConfig) {
      // Use registry default config and create widget via factory
      const unifiedConfig: UnifiedWidgetConfig = {
        ...widgetDef.defaultConfig,
        id: `widget-${Date.now()}`,
        type: widgetType,
        componentType: 'overlay',
      } as UnifiedWidgetConfig;

      const widget = createWidget<OverlayWidget>(widgetType, unifiedConfig);
      if (widget) {
        defaultWidget = widget;
      } else {
        // Fallback to basic widget
        defaultWidget = {
          id: unifiedConfig.id,
          type: widgetType,
          position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
          visibility: { trigger: 'always' },
          render: () => <div>New Widget</div>,
        };
      }
    } else {
      // Fallback to basic widget when no registry entry
      defaultWidget = {
        id: `widget-${Date.now()}`,
        type: widgetType,
        position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
        visibility: { trigger: 'always' },
        style: {}, // Ensure style object exists for style controls
        render: () => <div>New Widget</div>,
      };
    }

    onChange({
      ...configuration,
      widgets: [...configuration.widgets, defaultWidget],
    });

    setSelectedWidgetId(defaultWidget.id);
  };

  // Handle widget removal
  const handleRemoveWidget = (widgetId: string) => {
    const updatedWidgets = configuration.widgets.filter((w) => w.id !== widgetId);

    onChange({
      ...configuration,
      widgets: updatedWidgets,
    });

    if (selectedWidgetId === widgetId) {
      setSelectedWidgetId(null);
    }
  };

  // Handle widget reordering
  const handleReorderWidgets = (newOrder: OverlayWidget[]) => {
    onChange({
      ...configuration,
      widgets: newOrder,
    });
  };

  // Handle widget duplication
  const handleDuplicateWidget = (widget: OverlayWidget) => {
    // Create a copy of the widget with a new ID and slightly offset position
    const duplicatedWidget: OverlayWidget = {
      ...widget,
      id: `${widget.id}-copy-${Date.now()}`,
      position: 'anchor' in widget.position
        ? {
            ...widget.position,
            offset: {
              x: (widget.position.offset?.x ?? 0) + 16,
              y: (widget.position.offset?.y ?? 0) + 16,
            },
          }
        : {
            x: (widget.position as any).x + 16,
            y: (widget.position as any).y + 16,
          },
    };

    onChange({
      ...configuration,
      widgets: [...configuration.widgets, duplicatedWidget],
    });

    setSelectedWidgetId(duplicatedWidget.id);
  };

  return (
    <div className="flex gap-4 h-full">
      {/* Left sidebar: Widget list and presets */}
      <div className="w-64 flex flex-col gap-4">
        {/* Preset selector */}
        {presets.length > 0 && (
          <PresetSelector
            presets={presets}
            currentConfigId={configuration.id}
            onSelect={onPresetSelect}
          />
        )}

        {/* Widget list */}
        <WidgetList
          widgets={configuration.widgets}
          selectedWidgetId={selectedWidgetId}
          onSelectWidget={handleSelectWidget}
          onRemoveWidget={handleRemoveWidget}
          onReorderWidgets={handleReorderWidgets}
          onAddWidget={handleAddWidget}
          onDuplicateWidget={handleDuplicateWidget}
          availableWidgetTypes={availableWidgetTypes}
        />

        {/* Validation panel */}
        <ValidationPanel
          configuration={configuration}
          onSelectWidget={handleSelectWidget}
        />
      </div>

      {/* Center: Preview */}
      {preview && (
        <div className="flex-1 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-8">
          <div className="max-w-md w-full">
            {preview}
          </div>
        </div>
      )}

      {/* Right sidebar: Widget properties */}
      <div className="w-80">
        {selectedWidget ? (
          <WidgetPropertyEditor
            widget={selectedWidget}
            onUpdate={(updates) => handleUpdateWidget(selectedWidget.id, updates)}
          />
        ) : (
          <Panel className="h-full flex items-center justify-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Select a widget to edit its properties
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
