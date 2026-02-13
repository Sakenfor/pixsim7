/**
 * Widgets Settings Component
 *
 * Settings for overlay widget behavior (video scrub, upload, tooltips, etc.).
 * Auto-generates tabs from widgets that have settingsSchema defined.
 * Uses DynamicSettingsPanel with schema from widgets.settings.tsx.
 *
 * Registered as a sub-section of the Workspace module (see UnifiedPanelsSettings.tsx).
 *
 * NOTE: Schema registration is deferred to avoid circular dependency with widget registry.
 */

import { useMemo, useEffect, useRef } from 'react';

import { getWidgetsWithSettings } from '@lib/widgets';

import { registerWidgetSettings } from '../../lib/schemas/widgets.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

// Track if settings have been registered (deferred to avoid circular deps)
let widgetSettingsRegistered = false;

/** Default component - shows first widget's settings or empty state */
export function WidgetsSettings() {
  // Deferred registration to avoid circular dependency with widget registry
  const registeredRef = useRef(false);
  useEffect(() => {
    if (!widgetSettingsRegistered && !registeredRef.current) {
      registeredRef.current = true;
      widgetSettingsRegistered = true;
      registerWidgetSettings();
    }
  }, []);

  const widgetsWithSettings = useMemo(
    () => getWidgetsWithSettings(),
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
      <DynamicSettingsPanel categoryId="workspace" tabId={firstWidgetId} />
    </div>
  );
}
