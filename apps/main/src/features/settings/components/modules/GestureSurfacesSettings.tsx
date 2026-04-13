/**
 * Gesture Surface Settings Modules
 *
 * Iterates the gesture surface registry and registers one settings sidebar
 * entry per surface (gallery cards, viewer, recent strip, …). Adding a new
 * surface via `registerGestureSurface` auto-adds an entry here.
 */

import { getAllGestureSurfaces } from '@lib/gestures';

import { settingsRegistry } from '../../lib/core/registry';
import { categoryIdForSurface, registerGestureSurfaceSettings } from '../../lib/schemas/gestureSurfaces.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

let unregisterSchema: (() => void) | null = null;

function ensureSchemaRegistered() {
  if (!unregisterSchema) {
    unregisterSchema = registerGestureSurfaceSettings();
  }
}

ensureSchemaRegistered();

for (const descriptor of getAllGestureSurfaces()) {
  const categoryId = categoryIdForSurface(descriptor.id);
  const SurfacePanel = () => <DynamicSettingsPanel categoryId={categoryId} />;
  settingsRegistry.register({
    id: `gestures:${descriptor.id}`,
    label: descriptor.label,
    icon: descriptor.icon,
    component: SurfacePanel,
    order: 60 + (descriptor.order ?? 0),
  });
}
