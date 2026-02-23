/**
 * Gestures Settings Module
 *
 * Settings for mouse gesture actions on media cards.
 * Uses the schema-driven DynamicSettingsPanel for rendering.
 */
import { useEffect } from 'react';

import { settingsRegistry } from '../../lib/core/registry';
import { registerGestureSettings } from '../../lib/schemas/gestures.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

let unregisterSchema: (() => void) | null = null;

function ensureSchemaRegistered() {
  if (!unregisterSchema) {
    unregisterSchema = registerGestureSettings();
  }
}

export function GesturesSettings() {
  useEffect(() => {
    ensureSchemaRegistered();
  }, []);

  return <DynamicSettingsPanel categoryId="gestures" />;
}

// Self-register schema eagerly so fields are available even before component mounts
ensureSchemaRegistered();

// Register this module in the settings sidebar
settingsRegistry.register({
  id: 'gestures',
  label: 'Gestures',
  icon: '👆',
  component: GesturesSettings,
  order: 65,
});
