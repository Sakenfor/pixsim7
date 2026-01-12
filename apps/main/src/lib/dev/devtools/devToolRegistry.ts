/**
 * Dev Tool Registry
 *
 * Central registry for developer tools (debug panels, diagnostic views, etc.)
 * Similar to panelRegistry and graphEditorRegistry, this provides a unified
 * place to discover and access dev-focused tools.
 */

import { BaseRegistry } from '@lib/core/BaseRegistry';

import type { DevToolDefinition } from './types';

export class DevToolRegistry extends BaseRegistry<DevToolDefinition> {

  /**
   * Get all dev tools in a specific category
   */
  getByCategory(category: string): DevToolDefinition[] {
    return this.getAll().filter((tool) => tool.category === category);
  }

  /**
   * Search dev tools by query string
   * Searches across id, label, description, and tags
   */
  search(query: string): DevToolDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((tool) => {
      const matchesId = tool.id.toLowerCase().includes(lowerQuery);
      const matchesLabel = tool.label.toLowerCase().includes(lowerQuery);
      const matchesDescription = tool.description?.toLowerCase().includes(lowerQuery) ?? false;
      const matchesTags = tool.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery)) ?? false;

      return matchesId || matchesLabel || matchesDescription || matchesTags;
    });
  }

  /**
   * Get all unique categories from registered tools
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.getAll().forEach((tool) => {
      if (tool.category) {
        categories.add(tool.category);
      }
    });
    return Array.from(categories).sort();
  }

  /**
   * Get all dev tools that expose settings
   */
  getToolsWithSettings(): DevToolDefinition[] {
    return this.getAll().filter((tool) => tool.settings && tool.settings.length > 0);
  }
}

// Singleton instance
export const devToolRegistry = new DevToolRegistry();
