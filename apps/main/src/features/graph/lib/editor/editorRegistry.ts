/**
 * Graph Editor Registry
 *
 * Registry for managing graph editor surfaces (Scene Graph, Arc Graph, etc.)
 * Similar pattern to panelRegistry but specifically for graph editor UIs.
 * Part of Task 53 - Graph Editor Registry & Modular Surfaces
 */

import { BaseRegistry } from '@lib/core';

import type { GraphEditorDefinition } from './types';

/**
 * GraphEditorRegistry - Centralized registry for graph editor surfaces
 */
export class GraphEditorRegistry extends BaseRegistry<GraphEditorDefinition> {

  /**
   * Get graph editors by category
   */
  getByCategory(category: string): GraphEditorDefinition[] {
    return this.getAll().filter((editor) => editor.category === category);
  }

  /**
   * Search graph editors by query (searches id, label, description)
   */
  search(query: string): GraphEditorDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((editor) => {
      const matchesId = editor.id.toLowerCase().includes(lowerQuery);
      const matchesLabel = editor.label.toLowerCase().includes(lowerQuery);
      const matchesDescription = editor.description?.toLowerCase().includes(lowerQuery);

      return matchesId || matchesLabel || matchesDescription;
    });
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
