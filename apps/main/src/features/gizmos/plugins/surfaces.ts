/**
 * Gizmo Surface Definitions
 *
 * Defines all gizmo surfaces (UI presentation plugins) that can be
 * displayed in different contexts (game view, workspace, etc.)
 *
 * These surfaces are registered with the plugin catalog on app startup.
 */

import { WorldToolsPanel } from '@features/worldTools';

import { RelationshipDashboard } from '@/components/game/RelationshipDashboard';

import { BodyMapGizmo } from '../lib/core/components/BodyMapGizmo';
import { ConstellationGizmo } from '../lib/core/components/ConstellationGizmo';
import { OrbGizmo } from '../lib/core/components/OrbGizmo';
import { RingsGizmo } from '../lib/core/components/RingsGizmo';
import type { GizmoSurfaceDefinition } from '../lib/core/surfaceRegistry';

// Import gizmo components

// Import debug/dashboard components


// ============================================================================
// Scene Gizmos (Visual Overlays)
// ============================================================================

export const ringsGizmoSurface: GizmoSurfaceDefinition = {
  id: 'rings-gizmo',
  label: 'Rings Gizmo',
  description: 'Multi-layered orbital ring control for scene navigation',
  icon: '⭕',
  category: 'scene',
  overlayComponent: RingsGizmo,
  supportsContexts: ['scene-editor', 'game-2d', 'playground'],
  tags: ['interactive', 'scene-control', 'visual'],
  defaultEnabled: false,
  priority: 10,
};

export const orbGizmoSurface: GizmoSurfaceDefinition = {
  id: 'orb-gizmo',
  label: 'Orb Gizmo',
  description: 'Crystalline sphere controller for scene navigation',
  icon: '🔮',
  category: 'scene',
  overlayComponent: OrbGizmo,
  supportsContexts: ['scene-editor', 'game-2d', 'game-3d', 'playground'],
  tags: ['interactive', 'scene-control', '3d', 'visual'],
  defaultEnabled: false,
  priority: 9,
};

export const constellationGizmoSurface: GizmoSurfaceDefinition = {
  id: 'constellation-gizmo',
  label: 'Constellation Gizmo',
  description: 'Star field navigation controller for segment selection',
  icon: '✨',
  category: 'scene',
  overlayComponent: ConstellationGizmo,
  supportsContexts: ['scene-editor', 'game-2d', 'game-3d', 'playground'],
  tags: ['interactive', 'scene-control', '3d', 'visual', 'starfield'],
  defaultEnabled: false,
  priority: 8,
};

export const bodyMapGizmoSurface: GizmoSurfaceDefinition = {
  id: 'body-map-gizmo',
  label: 'Body Map Gizmo',
  description: 'Interactive body zones for romance/sensual interactions',
  icon: '🫱',
  category: 'scene',
  overlayComponent: BodyMapGizmo,
  supportsContexts: ['scene-editor', 'game-2d', 'playground'],
  tags: ['interactive', 'scene-control', 'romance', 'intimacy'],
  defaultEnabled: false,
  priority: 7,
  requires: {
    features: ['intimacy-scenes'],
  },
};

// ============================================================================
// NPC & World Debug Dashboards (Panels)
// ============================================================================

export const relationshipDebugSurface: GizmoSurfaceDefinition = {
  id: 'relationship-debug',
  label: 'Relationship Dashboard',
  description: 'View and debug NPC relationships, affinity, and intimacy levels',
  icon: '💕',
  category: 'npc',
  panelComponent: RelationshipDashboard,
  supportsContexts: ['workspace', 'game-2d', 'playground'],
  tags: ['debug', 'npc', 'relationships', 'affinity'],
  defaultEnabled: false,
  priority: 6,
};

export const worldToolsPanelSurface: GizmoSurfaceDefinition = {
  id: 'world-tools-panel',
  label: 'World Tools',
  description: 'Container for world tool plugins (quests, inventory, mood, etc.)',
  icon: '🌍',
  category: 'world',
  panelComponent: WorldToolsPanel,
  supportsContexts: ['workspace', 'game-2d', 'playground'],
  tags: ['debug', 'world', 'tools', 'quests', 'inventory'],
  defaultEnabled: false,
  priority: 5,
};
