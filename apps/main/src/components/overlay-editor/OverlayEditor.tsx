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
    const defaultWidget: OverlayWidget = {
      id: `widget-${Date.now()}`,
      type: widgetType,
      position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
      visibility: { trigger: 'always' },
      render: () => <div>New Widget</div>,
    };

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
          availableWidgetTypes={availableWidgetTypes}
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
