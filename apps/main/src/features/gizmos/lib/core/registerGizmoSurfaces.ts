/**
 * Register all gizmo surfaces
 *
 * This module registers all existing gizmo overlays and debug dashboards
 * as "surfaces" in the gizmo surface registry.
 */

import { gizmoSurfaceRegistry } from './surfaceRegistry';
import type { GizmoSurfaceDefinition } from './surfaceRegistry';

// Import gizmo components
import { RingsGizmo } from './components/RingsGizmo';
import { OrbGizmo } from './components/OrbGizmo';
import { ConstellationGizmo } from './components/ConstellationGizmo';
import { BodyMapGizmo } from './components/BodyMapGizmo';

// Import debug/dashboard components
import { RelationshipDashboard } from '../../components/game/RelationshipDashboard';
import { WorldToolsPanel } from '@features/worldTools';

/**
 * Register all core gizmo surfaces
 * Called on app startup to populate the registry
 */
export function registerGizmoSurfaces(): void {
  const surfaces: GizmoSurfaceDefinition[] = [
    // ========================================================================
    // Scene Gizmos (Visual Overlays)
    // ========================================================================

    {
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
    },

    {
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
    },

    {
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
    },

    {
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
    },

    // ========================================================================
    // NPC & World Debug Dashboards (Panels)
    // ========================================================================

    {
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
    },

    {
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
    },

    // ========================================================================
    // Future Surfaces (Placeholders)
    // ========================================================================

    // TODO: Add when implemented
    // {
    //   id: 'npc-mood-timeline',
    //   label: 'NPC Mood Timeline',
    //   description: 'Track NPC mood changes over time',
    //   icon: '📊',
    //   category: 'npc',
    //   panelComponent: NpcMoodTimeline,
    //   supportsContexts: ['workspace', 'playground'],
    //   tags: ['debug', 'npc', 'mood', 'timeline'],
    // },

    // TODO: Add when implemented
    // {
    //   id: 'world-time-overlay',
    //   label: 'World Time Overlay',
    //   description: 'Display and control world time/date',
    //   icon: '🕐',
    //   category: 'world',
    //   overlayComponent: WorldTimeOverlay,
    //   supportsContexts: ['game-2d', 'game-3d', 'playground'],
    //   tags: ['debug', 'world', 'time'],
    // },

    // TODO: Add when NpcBrainLab is componentized
    // {
    //   id: 'brain-playground',
    //   label: 'NPC Brain Playground',
    //   description: 'Debug and visualize NPC decision-making',
    //   icon: '🧠',
    //   category: 'npc',
    //   panelComponent: NpcBrainPlayground,
    //   supportsContexts: ['workspace', 'playground'],
    //   tags: ['debug', 'npc', 'brain', 'ai'],
    // },
  ];

  // Register all surfaces
  gizmoSurfaceRegistry.registerAll(surfaces);

  console.log(
    `[GizmoSurfaces] Registered ${surfaces.length} gizmo surfaces:`,
    surfaces.map(s => s.id)
  );
}

/**
 * Get all scene gizmo surfaces (for Game2D, scene editor, etc.)
 */
export function getSceneGizmoSurfaces() {
  return gizmoSurfaceRegistry.getByCategory('scene');
}

/**
 * Get all debug panel surfaces (for workspace/dev tools)
 */
export function getDebugPanelSurfaces() {
  return [
    ...gizmoSurfaceRegistry.getByCategory('npc'),
    ...gizmoSurfaceRegistry.getByCategory('world'),
    ...gizmoSurfaceRegistry.getByCategory('debug'),
  ];
}

/**
 * Get gizmo surfaces available for a specific context
 */
export function getGizmoSurfacesForContext(
  context: 'scene-editor' | 'game-2d' | 'game-3d' | 'playground' | 'workspace' | 'hud'
) {
  return gizmoSurfaceRegistry.getByContext(context);
}
