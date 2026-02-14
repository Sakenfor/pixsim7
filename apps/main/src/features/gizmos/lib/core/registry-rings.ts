/**
 * Rings Gizmo Pack
 * Adds the Rings gizmo for multi-layered parameter control
 *
 * This pack is standalone and does not bundle other tools.
 * Import water, banana, or other tools from their individual registries.
 */

import {
  registerGizmo,
  type GizmoDefinition,
} from '@pixsim7/interaction.gizmos';
import { lazy } from 'react';

// ============================================================================
// Rings Gizmo
// ============================================================================

export const ringsGizmo: GizmoDefinition = {
  id: 'rings',
  name: 'Orbital Rings',
  category: 'control',
  description: 'Multi-layered ring system for controlling multiple parameters simultaneously',
  tags: ['3d', 'multi-param', 'advanced', 'rotation'],

  // Component will be loaded lazily
  component: lazy(() =>
    import('./components/RingsGizmo').then(m => ({ default: m.RingsGizmo }))
  ),

  defaultConfig: {
    style: 'rings',

    // Each zone is a ring with its own parameters
    zones: [
      {
        id: 'inner',
        position: { x: 0, y: 0, z: 0 },
        radius: 80,
        label: 'Inner Ring',
        color: '#00D9FF',
        segmentId: 'gentle',
        intensity: 0.3,
      },
      {
        id: 'middle',
        position: { x: 0, y: 0, z: 0 },
        radius: 140,
        label: 'Middle Ring',
        color: '#9333EA',
        segmentId: 'moderate',
        intensity: 0.6,
      },
      {
        id: 'outer',
        position: { x: 0, y: 0, z: 0 },
        radius: 200,
        label: 'Outer Ring',
        color: '#F43F5E',
        segmentId: 'intense',
        intensity: 0.9,
      },
    ],

    visual: {
      baseColor: '#00D9FF',
      activeColor: '#9333EA',
      glowIntensity: 0.6,
      particleType: 'stars',
      trailLength: 0.4,
      opacity: 0.9,
    },

    physics: {
      magnetism: true,
      friction: 0.95,
      springiness: 0.4,
    },

    audio: {
      hover: 'rings-hover',
      select: 'rings-select',
    },

    gestures: {
      swipeUp: { type: 'speed', value: 1.5 },
      pinch: { type: 'mode', value: 'transition' },
      rotateClockwise: { type: 'mode', value: 'next' },
    },
  },
};

// ============================================================================
// Auto-register
// ============================================================================

registerGizmo(ringsGizmo);

// ============================================================================
// Exports
// ============================================================================

export const ringsGizmos = [ringsGizmo];
