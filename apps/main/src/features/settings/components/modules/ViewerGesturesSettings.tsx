/**
 * Viewer Gestures Settings Module
 *
 * Settings for gesture actions in the media viewer (viewing mode).
 * Uses the schema-driven DynamicSettingsPanel for rendering.
 */
import { useEffect } from 'react';

import { settingsRegistry } from '../../lib/core/registry';
import { registerViewerGestureSettings } from '../../lib/schemas/viewerGestures.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

let unregisterSchema: (() => void) | null = null;

function ensureSchemaRegistered() {
  if (!unregisterSchema) {
    unregisterSchema = registerViewerGestureSettings();
  }
}

export function ViewerGesturesSettings() {
  useEffect(() => {
    ensureSchemaRegistered();
  }, []);

  return <DynamicSettingsPanel categoryId="viewer-gestures" />;
}

// Self-register schema eagerly
ensureSchemaRegistered();

// Register this module in the settings sidebar
settingsRegistry.register({
  id: 'viewer-gestures',
  label: 'Viewer Gestures',
  icon: '🖼️',
  component: ViewerGesturesSettings,
  order: 66,
});
