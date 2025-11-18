/**
 * Rings Gizmo Pack
 * Adds the Rings gizmo for multi-layered parameter control
 */

import {
  registerGizmo,
  type GizmoDefinition,
} from '@pixsim7/scene-gizmos';
import { lazy } from 'react';

// Re-export all previous packs
export * from './registry-water-banana';

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
    import('../../components/gizmos/RingsGizmo').then(m => ({ default: m.RingsGizmo }))
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
        meta: { ring: 0, rotationSpeed: 0.5 },
      },
      {
        id: 'middle',
        position: { x: 0, y: 0, z: 0 },
        radius: 140,
        label: 'Middle Ring',
        color: '#9333EA',
        segmentId: 'moderate',
        intensity: 0.6,
        meta: { ring: 1, rotationSpeed: 0.3 },
      },
      {
        id: 'outer',
        position: { x: 0, y: 0, z: 0 },
        radius: 200,
        label: 'Outer Ring',
        color: '#F43F5E',
        segmentId: 'intense',
        intensity: 0.9,
        meta: { ring: 2, rotationSpeed: 0.2 },
      },
    ],

    visual: {
      baseColor: '#00D9FF',
      activeColor: '#9333EA',
      highlightColor: '#F43F5E',
      glow: true,
      particleType: 'stars',
      trailEffect: true,
    },

    physics: {
      magnetism: 0.3,
      snap: true,
      momentum: 0.8,
      friction: 0.95,
    },

    audio: {
      enabled: true,
      volume: 0.3,
      pitch: 1.0,
      layered: true, // Each ring has its own audio layer
    },

    gestures: {
      swipe: { type: 'speed', value: 1.5 },
      pinch: { type: 'transition', value: 'fade' },
      rotate: { type: 'ring', value: 'next' }, // Rotate to switch rings
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
