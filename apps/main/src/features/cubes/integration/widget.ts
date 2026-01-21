/**
 * Cubes Widget Registration
 *
 * Registers the cube overlay as a widget in the unified widget system.
 */

import { createElement } from 'react';

import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '@lib/ui/overlay';
import type { WidgetDefinition } from '@lib/widgets/types';
import { registerWidget } from '@lib/widgets/widgetRegistry';

import { CubeWidgetOverlay } from '../CubeWidgetOverlay';

import {
  getCubesVisibility,
  getFormation,
  subscribeToVisibility,
  subscribeToFormation,
} from './capabilities';

/**
 * Create a cube overlay widget instance
 */
function createCubeOverlayWidget(config?: {
  id?: string;
  position?: WidgetPosition;
  visibility?: VisibilityConfig;
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
    type: 'cube-overlay',
    position: config?.position || { anchor: 'center' },
    visibility: config?.visibility || { trigger: 'always' },
    priority: 100, // High priority - always on top

    render: () =>
      createElement(CubeWidgetOverlay, {
        visible,
        initialFormation: formation,
      }),

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
    position: { mode: 'anchor', anchor: 'center', offset: { x: 0, y: 0 } },
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
