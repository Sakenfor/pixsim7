/**
 * Gesture Surface Settings Modules
 *
 * Groups all registered gesture surfaces (gallery cards, viewer, recent strip, …)
 * under a single top-level "Gestures" settings entry; surfaces appear as
 * sub-sections. Reads the gesture-surface registry live — surfaces registered
 * after this module loads (lazy features, HMR) re-sync automatically.
 */

import { getAllGestureSurfaces, subscribeGestureSurfaces } from '@lib/gestures';

import { settingsRegistry, type SettingsSubSection } from '../../lib/core/registry';
import {
  categoryIdForSurface,
  registerGestureSurfaceSettings,
  registerGestureGeneralSettings,
  GESTURE_GENERAL_CATEGORY_ID,
} from '../../lib/schemas/gestureSurfaces.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

let unregisterSchema: (() => void) | null = null;
let unregisterGeneralSchema: (() => void) | null = null;

function syncGestures() {
  // Rebuild schema registrations from current surface set.
  unregisterSchema?.();
  unregisterSchema = registerGestureSurfaceSettings();
  // Global (cross-surface) gesture settings — registered once is enough, but
  // re-registering on resync is idempotent (register replaces by categoryId).
  unregisterGeneralSchema?.();
  unregisterGeneralSchema = registerGestureGeneralSettings();

  const surfaces = getAllGestureSurfaces();

  // Global "General" section leads, then one sub-section per surface.
  const GeneralPanel = () => <DynamicSettingsPanel categoryId={GESTURE_GENERAL_CATEGORY_ID} />;
  const subSections: SettingsSubSection[] = [
    { id: 'general', label: 'General', icon: '⚙️', component: GeneralPanel },
    ...surfaces.map((descriptor) => {
      const categoryId = categoryIdForSurface(descriptor.id);
      const SurfacePanel = () => <DynamicSettingsPanel categoryId={categoryId} />;
      return {
        id: descriptor.id,
        label: descriptor.label,
        icon: descriptor.icon,
        component: SurfacePanel,
      };
    }),
  ];

  const DefaultGesturePanel = subSections[0]?.component
    ?? (() => <div className="p-4 text-sm text-neutral-500">No gesture surfaces registered.</div>);

  settingsRegistry.register({
    id: 'gestures',
    label: 'Gestures',
    icon: '👆',
    component: DefaultGesturePanel,
    order: 60,
    subSections,
  });
}

syncGestures();
subscribeGestureSurfaces(syncGestures);
