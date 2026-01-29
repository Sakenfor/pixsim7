/**
 * Widgets Settings Module
 *
 * Settings for overlay widget behavior (video scrub, upload, tooltips, etc.).
 * Auto-generates tabs and sub-sections from widgets that have settingsSchema defined.
 */

import { useMemo } from 'react';

import { widgetRegistry } from '@lib/widgets';

import { settingsRegistry, type SettingsSubSection } from '../../lib/core/registry';
import { registerWidgetSettings } from '../../lib/schemas/widgets.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

// Auto-register schema-based settings when module loads
registerWidgetSettings();

/**
 * Create a settings component for a specific widget.
 */
function createWidgetSettingsComponent(widgetId: string) {
  return function WidgetSettingsTab() {
    return (
      <div className="flex-1 overflow-auto p-4">
        <DynamicSettingsPanel categoryId="widgets" tabId={widgetId} />
      </div>
    );
  };
}

/**
 * Get all widgets with settings schemas and generate sub-sections.
 */
function getWidgetSubSections(): SettingsSubSection[] {
  const widgetsWithSettings = widgetRegistry.getAll().filter(w => w.settingsSchema);

  return widgetsWithSettings.map(widget => ({
    id: widget.id,
    label: widget.title,
    icon: widget.icon,
    component: createWidgetSettingsComponent(widget.id),
  }));
}

/** Default component - shows first widget's settings or empty state */
export function WidgetsSettings() {
  const widgetsWithSettings = useMemo(
    () => widgetRegistry.getAll().filter(w => w.settingsSchema),
    []
  );

  if (widgetsWithSettings.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500">
        No widgets with configurable settings found.
      </div>
    );
  }

  // Show first widget by default
  const firstWidgetId = widgetsWithSettings[0].id;
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="widgets" tabId={firstWidgetId} />
    </div>
  );
}

// Build sub-sections dynamically from registry
const subSections = getWidgetSubSections();

// Register this module with auto-generated sub-sections
settingsRegistry.register({
  id: 'widgets',
  label: 'Widgets',
  icon: '🧩',
  component: WidgetsSettings,
  order: 25, // After UI (20), before Library (35)
  subSections: subSections.length > 0 ? subSections : undefined,
});
