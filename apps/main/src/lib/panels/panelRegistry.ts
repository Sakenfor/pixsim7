/**
 * Panel Registry
 *
 * Dynamic panel registration system for workspace panels.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import type { PanelId } from '../../stores/workspaceStore';
import type { ComponentType } from 'react';

export interface WorkspaceContext {
  currentSceneId?: string | null;
  [key: string]: any;
}

export interface PanelDefinition {
  id: PanelId;
  title: string;
  component: ComponentType<any>;
  category: 'core' | 'development' | 'game' | 'tools' | 'custom';
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
export class PanelRegistry {
  private panels = new Map<PanelId, PanelDefinition>();
  private listeners: Set<() => void> = new Set();

  /**
   * Register a panel definition
   */
  register(definition: PanelDefinition): void {
    if (this.panels.has(definition.id)) {
      console.warn(`Panel "${definition.id}" is already registered. Overwriting.`);
    }

    this.panels.set(definition.id, definition);
    this.notifyListeners();
  }

  /**
   * Unregister a panel
   */
  unregister(panelId: PanelId): void {
    const definition = this.panels.get(panelId);
    if (definition) {
      // Call cleanup hook
      if (definition.onUnmount) {
        try {
          definition.onUnmount();
        } catch (error) {
          console.error(`Error in onUnmount for panel "${panelId}":`, error);
        }
      }

      this.panels.delete(panelId);
      this.notifyListeners();
    }
  }

  /**
   * Get a panel definition by ID
   */
  get(panelId: PanelId): PanelDefinition | undefined {
    return this.panels.get(panelId);
  }

  /**
   * Get all registered panels
   */
  getAll(): PanelDefinition[] {
    return Array.from(this.panels.values());
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
   * Check if a panel is registered
   */
  has(panelId: PanelId): boolean {
    return this.panels.has(panelId);
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
   * Subscribe to registry changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('Error in registry listener:', error);
      }
    });
  }

  /**
   * Clear all panels (useful for testing)
   */
  clear(): void {
    // Call onUnmount for all panels
    this.panels.forEach((definition) => {
      if (definition.onUnmount) {
        try {
          definition.onUnmount();
        } catch (error) {
          console.error(`Error in onUnmount for panel "${definition.id}":`, error);
        }
      }
    });

    this.panels.clear();
    this.notifyListeners();
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      byCategory: {
        core: all.filter((p) => p.category === 'core').length,
        development: all.filter((p) => p.category === 'development').length,
        game: all.filter((p) => p.category === 'game').length,
        tools: all.filter((p) => p.category === 'tools').length,
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
