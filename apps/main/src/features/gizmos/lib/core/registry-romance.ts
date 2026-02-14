/**
 * Romance Gizmo Pack - Romance and sensual touch gizmos
 *
 * All romance tools (hand-3d, caress, silk, feather, pleasure) are now loaded
 * dynamically from the romance plugin manifest as two tool packs:
 * - Touch Tools: hand-3d, caress, silk (direct touch variants)
 * - Sensation Tools: feather, pleasure (indirect/heightened sensation)
 *
 * This file only registers the body map gizmo for visual interaction.
 */

import {
  registerGizmo,
  type GizmoDefinition,
} from '@pixsim7/interaction.gizmos';
import { BodyMapGizmo } from './components/BodyMapGizmo';

// ============================================================================
// Romance Gizmos
// ============================================================================

/**
 * Body Map Gizmo - Interactive body zones for sensual touch
 *
 * ⚠️ VISUAL STUB - NOT PRODUCTION READY ⚠️
 * This gizmo is fully registered and functional but uses placeholder visuals.
 * The component (BodyMapGizmo.tsx) implements core logic (zones, intensity tracking,
 * pleasure meter) but all visuals are basic placeholders with extensive [OPUS] TODOs
 * for:
 * - Elegant body silhouette design
 * - Animated zone highlights and particle effects
 * - Smooth transitions and visual feedback
 * - Enhanced pleasure meter UI
 * - Ambient effects and screen-space distortions
 *
 * The gizmo is renderable in GizmoLab and scene player, but not suitable for
 * production use until visual enhancements are complete.
 *
 * See BodyMapGizmo.tsx for detailed visual implementation tasks.
 */
export const bodyMapGizmo: GizmoDefinition = {
  id: 'body-map',
  name: 'Body Map',
  category: 'interactive',
  component: BodyMapGizmo,
  description: 'Interactive body map for sensual touch gameplay. Explore zones with various tools. (Visual stub - needs enhancement)',
  preview: '/previews/body-map-gizmo.mp4', // TODO: Create preview video
  tags: ['romance', 'sensual', 'interactive', 'zones', 'stub'],

  defaultConfig: {
    style: 'custom',
    zones: [
      // Define default body zones
      // TODO [OPUS]: Map these to actual body part positions
      { id: 'face', position: { x: 0, y: -80, z: 0 }, radius: 30, label: 'Face', color: '#FFB6C1' },
      { id: 'neck', position: { x: 0, y: -50, z: 0 }, radius: 25, label: 'Neck', color: '#FFC0CB' },
      { id: 'shoulders', position: { x: 0, y: -30, z: 0 }, radius: 40, label: 'Shoulders', color: '#FFD1DC' },
      { id: 'chest', position: { x: 0, y: 0, z: 0 }, radius: 35, label: 'Chest', color: '#FFB6D9' },
      { id: 'back', position: { x: 0, y: 0, z: -20 }, radius: 40, label: 'Back', color: '#FFC0E0' },
      { id: 'arms', position: { x: 40, y: -10, z: 0 }, radius: 20, label: 'Arms', color: '#FFD1E8' },
      { id: 'hands', position: { x: 50, y: 20, z: 0 }, radius: 15, label: 'Hands', color: '#FFCCE5' },
      { id: 'waist', position: { x: 0, y: 30, z: 0 }, radius: 30, label: 'Waist', color: '#FFA6C9' },
      { id: 'hips', position: { x: 0, y: 50, z: 0 }, radius: 35, label: 'Hips', color: '#FF9EC4' },
      { id: 'thighs', position: { x: 0, y: 80, z: 0 }, radius: 30, label: 'Thighs', color: '#FFB6D9' },
      { id: 'legs', position: { x: 0, y: 110, z: 0 }, radius: 25, label: 'Legs', color: '#FFC0E0' },
      { id: 'feet', position: { x: 0, y: 140, z: 0 }, radius: 20, label: 'Feet', color: '#FFD1E8' },
    ],
    visual: {
      baseColor: '#FFB6C1',
      activeColor: '#FF69B4',
      particleType: 'hearts',
      glowIntensity: 0.6,
      opacity: 0.8,
    },
    physics: {
      magnetism: true,
      springiness: 0.3,
    },
  },
};

// ============================================================================
// Auto-register gizmo
// ============================================================================

registerGizmo(bodyMapGizmo);
