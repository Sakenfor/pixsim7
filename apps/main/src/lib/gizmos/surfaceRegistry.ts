/**
 * Gizmo Surface Registry
 *
 * Manages gizmo and debug dashboard "surfaces" - making them pluggable UI components
 * that can appear as workspace panels, in-scene overlays, or HUD elements.
 *
 * This is separate from the core gizmo registry (@pixsim7/scene.gizmos) which handles
 * gizmo logic and configuration. Surface registry focuses on UI presentation.
 */

import type * as React from 'react';

// ============================================================================
// Gizmo Surface Types
// ============================================================================

/**
 * Identifier for gizmo surfaces
 */
export type GizmoSurfaceId =
  | 'rings-gizmo'
  | 'orb-gizmo'
  | 'constellation-gizmo'
  | 'body-map-gizmo'
  | 'npc-mood-timeline'
  | 'relationship-debug'
  | 'world-time-overlay'
  | 'brain-playground'
  | string;

/**
 * Categories for organizing gizmo surfaces
 */
export type GizmoSurfaceCategory =
  | 'scene'      // Scene-level gizmos (visual overlays, rings, orbs, etc.)
  | 'world'      // World-level dashboards (time, weather, etc.)
  | 'npc'        // NPC-related tools (mood, relationship, brain debugging)
  | 'debug'      // Debug/developer dashboards
  | 'custom';    // User-defined/plugin surfaces

/**
 * Context in which a gizmo surface can be displayed
 */
export type GizmoSurfaceContext =
  | 'scene-editor'   // Scene editing mode
  | 'game-2d'        // 2D game view
  | 'game-3d'        // 3D game view
  | 'playground'     // Simulation playground/sandbox
  | 'workspace'      // General workspace panel
  | 'hud';           // HUD overlay

/**
 * Definition of a gizmo surface - describes how a gizmo/debug dashboard
 * can be presented in the UI.
 */
export interface GizmoSurfaceDefinition {
  /** Unique identifier */
  id: GizmoSurfaceId;

  /** Display name */
  label: string;

  /** Description of what this surface does */
  description?: string;

  /** Icon (emoji or icon name) */
  icon?: string;

  /** Category for organizing surfaces */
  category?: GizmoSurfaceCategory;

  // UI Components

  /** Component for rendering as a workspace/debug panel */
  panelComponent?: React.ComponentType<any>;

  /** Component for rendering as an in-scene/world overlay */
  overlayComponent?: React.ComponentType<any>;

  /** Component for rendering in HUD */
  hudComponent?: React.ComponentType<any>;

  // Context Support

  /** Which contexts this surface can be displayed in */
  supportsContexts?: GizmoSurfaceContext[];

  // Metadata

  /** Tags for searching/filtering */
  tags?: string[];

  /** Default enabled state */
  defaultEnabled?: boolean;

  /** Priority for display order (higher = shown first) */
  priority?: number;

  /** Whether this surface requires specific features/capabilities */
  requires?: {
    features?: string[];
    permissions?: string[];
  };
}

// ============================================================================
// Gizmo Surface Registry
// ============================================================================

export class GizmoSurfaceRegistry {
  private surfaces = new Map<GizmoSurfaceId, GizmoSurfaceDefinition>();

  /**
   * Register a gizmo surface
   */
  register(definition: GizmoSurfaceDefinition): void {
    if (this.surfaces.has(definition.id)) {
      console.warn(`[GizmoSurfaceRegistry] Overwriting existing surface: ${definition.id}`);
    }

    this.surfaces.set(definition.id, definition);
  }

  /**
   * Register multiple surfaces at once
   */
  registerAll(definitions: GizmoSurfaceDefinition[]): void {
    definitions.forEach(def => this.register(def));
  }

  /**
   * Get a specific gizmo surface by ID
   */
  get(id: GizmoSurfaceId): GizmoSurfaceDefinition | undefined {
    return this.surfaces.get(id);
  }

  /**
   * Get all registered gizmo surfaces
   */
  getAll(): GizmoSurfaceDefinition[] {
    return Array.from(this.surfaces.values());
  }

  /**
   * Get surfaces by category
   */
  getByCategory(category: GizmoSurfaceCategory): GizmoSurfaceDefinition[] {
    return this.getAll().filter(surface => surface.category === category);
  }

  /**
   * Get surfaces that support a specific context
   */
  getByContext(context: GizmoSurfaceContext): GizmoSurfaceDefinition[] {
    return this.getAll().filter(surface =>
      surface.supportsContexts?.includes(context)
    );
  }

  /**
   * Get surfaces by tag
   */
  getByTag(tag: string): GizmoSurfaceDefinition[] {
    return this.getAll().filter(surface =>
      surface.tags?.includes(tag)
    );
  }

  /**
   * Check if a surface is registered
   */
  has(id: GizmoSurfaceId): boolean {
    return this.surfaces.has(id);
  }

  /**
   * Unregister a surface
   */
  unregister(id: GizmoSurfaceId): boolean {
    return this.surfaces.delete(id);
  }

  /**
   * Clear all registered surfaces
   */
  clear(): void {
    this.surfaces.clear();
  }

  /**
   * Get count of registered surfaces
   */
  get count(): number {
    return this.surfaces.size;
  }

  /**
   * Get all surface IDs
   */
  getAllIds(): GizmoSurfaceId[] {
    return Array.from(this.surfaces.keys());
  }

  /**
   * Get surfaces sorted by priority (descending)
   */
  getSortedByPriority(): GizmoSurfaceDefinition[] {
    return this.getAll().sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityB - priorityA;
    });
  }
}

// ============================================================================
// Global Registry Instance
// ============================================================================

/**
 * Global gizmo surface registry instance
 */
export const gizmoSurfaceRegistry = new GizmoSurfaceRegistry();
