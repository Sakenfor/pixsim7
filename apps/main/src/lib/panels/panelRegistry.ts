/**
 * Panel Registry
 *
 * Dynamic panel registration system for workspace panels.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import type { PanelId } from '../../stores/workspaceStore';
import type { ComponentType } from 'react';
import { BaseRegistry } from '../core/BaseRegistry';

export interface WorkspaceContext {
  currentSceneId?: string | null;
  [key: string]: any;
}

export type PanelCategory =
  // Core workspace
  | 'workspace'      // Gallery, Graph, Inspector

  // Domain-specific
  | 'scene'          // Scene Builder, Scene Management, Scene Library, etc.
  | 'game'           // Game Theming, Game iframe, etc.

  // Development & tools
  | 'dev'            // Dev Tools panel (launcher)
  | 'tools'          // Gizmo Lab, NPC Brain Lab, HUD Designer
  | 'utilities'      // Export/Import, Validation, Settings

  // System
  | 'system'         // Health, Provider Settings

  // Legacy/custom
  | 'custom';        // Custom panels from plugins

export interface PanelDefinition {
  id: PanelId;
  title: string;
  component: ComponentType<any>;
  category: PanelCategory;
  tags: string[];
  icon?: string;
  description?: string;
  defaultSettings?: Record<string, any>;

  // Visibility predicates
  showWhen?: (context: WorkspaceContext) => boolean;

  // Lifecycle hooks
  onMount?: () => void;
  onUnmount?: () => void;

  // Capabilities
  supportsCompactMode?: boolean;
  supportsMultipleInstances?: boolean;
  requiresContext?: boolean;
}

/**
 * PanelRegistry - Centralized registry for all workspace panels
 */
export class PanelRegistry extends BaseRegistry<PanelDefinition> {
  /**
   * Unregister a panel
   * Calls onUnmount hook before removing the panel.
   */
  unregister(panelId: PanelId): boolean {
    const definition = this.items.get(panelId);
    if (definition) {
      // Call cleanup hook
      if (definition.onUnmount) {
        try {
          definition.onUnmount();
        } catch (error) {
          console.error(`Error in onUnmount for panel "${panelId}":`, error);
        }
      }

      return super.unregister(panelId);
    }
    return false;
  }

  /**
   * Get panels by category
   */
  getByCategory(category: string): PanelDefinition[] {
    return this.getAll().filter((panel) => panel.category === category);
  }

  /**
   * Search panels by query (searches id, title, description, tags)
   */
  search(query: string): PanelDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((panel) => {
      const matchesId = panel.id.toLowerCase().includes(lowerQuery);
      const matchesTitle = panel.title.toLowerCase().includes(lowerQuery);
      const matchesDescription = panel.description?.toLowerCase().includes(lowerQuery);
      const matchesTags = panel.tags.some((tag) => tag.toLowerCase().includes(lowerQuery));

      return matchesId || matchesTitle || matchesDescription || matchesTags;
    });
  }

  /**
   * Get visible panels based on context
   */
  getVisiblePanels(context: WorkspaceContext): PanelDefinition[] {
    return this.getAll().filter((panel) => {
      if (!panel.showWhen) return true;
      try {
        return panel.showWhen(context);
      } catch (error) {
        console.error(`Error in showWhen for panel "${panel.id}":`, error);
        return false;
      }
    });
  }

  /**
   * Clear all panels (useful for testing)
   * Calls onUnmount hook for each panel before clearing.
   */
  clear(): void {
    // Call onUnmount for all panels
    this.items.forEach((definition) => {
      if (definition.onUnmount) {
        try {
          definition.onUnmount();
        } catch (error) {
          console.error(`Error in onUnmount for panel "${definition.id}":`, error);
        }
      }
    });

    super.clear();
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      byCategory: {
        workspace: all.filter((p) => p.category === 'workspace').length,
        scene: all.filter((p) => p.category === 'scene').length,
        game: all.filter((p) => p.category === 'game').length,
        dev: all.filter((p) => p.category === 'dev').length,
        tools: all.filter((p) => p.category === 'tools').length,
        utilities: all.filter((p) => p.category === 'utilities').length,
        system: all.filter((p) => p.category === 'system').length,
        custom: all.filter((p) => p.category === 'custom').length,
      },
      capabilities: {
        supportsCompactMode: all.filter((p) => p.supportsCompactMode).length,
        supportsMultipleInstances: all.filter((p) => p.supportsMultipleInstances).length,
        requiresContext: all.filter((p) => p.requiresContext).length,
      },
    };
  }
}

// Global panel registry singleton
export const panelRegistry = new PanelRegistry();
