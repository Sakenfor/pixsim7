/**
 * Cubes Widget Registration
 *
 * Registers the cube overlay as a widget in the unified widget system.
 */

import type { OverlayWidget, OverlayWidgetPosition, OverlayWidgetVisibility } from '@lib/ui/overlay';
import type { WidgetDefinition } from '@lib/widgets/types';
import { registerWidget } from '@lib/widgets/widgetRegistry';

import {
  getCubesVisibility,
  getFormation,
  subscribeToVisibility,
  subscribeToFormation,
  toggleCubesVisibility,
  cycleFormation,
} from './capabilities';

/**
 * Create a cube overlay widget instance
 */
function createCubeOverlayWidget(config?: {
  id?: string;
  position?: OverlayWidgetPosition;
  visibility?: OverlayWidgetVisibility;
}): OverlayWidget {
  let visible = getCubesVisibility();
  let formation = getFormation();
  let updateCallback: (() => void) | null = null;

  // Subscribe to visibility changes
  const unsubVisible = subscribeToVisibility((v) => {
    visible = v;
    updateCallback?.();
  });

  // Subscribe to formation changes
  const unsubFormation = subscribeToFormation((f) => {
    formation = f;
    updateCallback?.();
  });

  return {
    id: config?.id || 'cube-overlay',
    position: config?.position || { mode: 'fixed' },
    visibility: config?.visibility || { mode: 'always' },
    priority: 100, // High priority - always on top

    render: () => {
      if (!visible) return null;

      // Return a render descriptor for the cube overlay
      // The actual rendering is handled by CubeWidgetOverlay component
      return {
        type: 'cube-overlay',
        props: {
          formation,
          visible,
          onToggle: toggleCubesVisibility,
          onCycleFormation: cycleFormation,
        },
      };
    },

    onUpdate: (callback) => {
      updateCallback = callback;
    },

    dispose: () => {
      unsubVisible();
      unsubFormation();
      updateCallback = null;
    },
  };
}

/**
 * Cube overlay widget definition
 */
export const cubeOverlayWidget: WidgetDefinition = {
  id: 'cube-overlay',
  title: 'Cube Formation',
  description: '3D cube widget overlay with draggable cubes and formation patterns',
  icon: 'box',
  category: 'display',
  domain: 'overlay',
  tags: ['cube', '3d', 'overlay', 'formation', 'widget'],
  surfaces: ['overlay'],
  surfaceConfig: {
    overlay: {
      defaultAnchor: 'center',
    },
  },
  factory: (config) => {
    return createCubeOverlayWidget({
      id: config.id,
    });
  },
  defaultConfig: {
    type: 'cube-overlay',
    componentType: 'overlay',
    position: { mode: 'fixed' },
    visibility: { simple: 'always' },
    props: {},
    version: 1,
  },
};

/**
 * Register cube overlay widget
 */
export function registerCubeWidget(): void {
  registerWidget(cubeOverlayWidget);
  console.log('[cubes] Registered cube overlay widget');
}
