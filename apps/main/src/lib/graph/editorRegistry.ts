/**
 * Graph Editor Registry
 *
 * Registry for managing graph editor surfaces (Scene Graph, Arc Graph, etc.)
 * Similar pattern to panelRegistry but specifically for graph editor UIs.
 * Part of Task 53 - Graph Editor Registry & Modular Surfaces
 */

import type { GraphEditorDefinition, GraphEditorId } from './types';

/**
 * GraphEditorRegistry - Centralized registry for graph editor surfaces
 */
export class GraphEditorRegistry {
  private editors = new Map<GraphEditorId, GraphEditorDefinition>();
  private listeners: Set<() => void> = new Set();

  /**
   * Register a graph editor definition
   */
  register(def: GraphEditorDefinition): void {
    if (this.editors.has(def.id)) {
      console.warn(`Graph editor "${def.id}" is already registered. Overwriting.`);
    }

    this.editors.set(def.id, def);
    this.notifyListeners();
  }

  /**
   * Unregister a graph editor
   */
  unregister(id: GraphEditorId): void {
    this.editors.delete(id);
    this.notifyListeners();
  }

  /**
   * Get a graph editor definition by ID
   */
  get(id: GraphEditorId): GraphEditorDefinition | undefined {
    return this.editors.get(id);
  }

  /**
   * Get all registered graph editors
   */
  getAll(): GraphEditorDefinition[] {
    return Array.from(this.editors.values());
  }

  /**
   * Get graph editors by category
   */
  getByCategory(category: string): GraphEditorDefinition[] {
    return this.getAll().filter((editor) => editor.category === category);
  }

  /**
   * Check if a graph editor is registered
   */
  has(id: GraphEditorId): boolean {
    return this.editors.has(id);
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
        console.error('Error in graph editor registry listener:', error);
      }
    });
  }

  /**
   * Clear all graph editors (useful for testing)
   */
  clear(): void {
    this.editors.clear();
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
        core: all.filter((e) => e.category === 'core').length,
        world: all.filter((e) => e.category === 'world').length,
        arc: all.filter((e) => e.category === 'arc').length,
        debug: all.filter((e) => e.category === 'debug').length,
        custom: all.filter((e) => e.category === 'custom').length,
      },
      capabilities: {
        supportsMultiScene: all.filter((e) => e.supportsMultiScene).length,
        supportsWorldContext: all.filter((e) => e.supportsWorldContext).length,
        supportsPlayback: all.filter((e) => e.supportsPlayback).length,
      },
    };
  }
}

// Global graph editor registry singleton
export const graphEditorRegistry = new GraphEditorRegistry();
