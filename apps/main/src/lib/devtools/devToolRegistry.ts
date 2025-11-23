/**
 * Dev Tool Registry
 *
 * Central registry for developer tools (debug panels, diagnostic views, etc.)
 * Similar to panelRegistry and graphEditorRegistry, this provides a unified
 * place to discover and access dev-focused tools.
 */

import type { DevToolDefinition, DevToolId } from './types';

export class DevToolRegistry {
  private tools = new Map<DevToolId, DevToolDefinition>();

  /**
   * Register a new dev tool
   */
  register(def: DevToolDefinition): void {
    if (this.tools.has(def.id)) {
      console.warn(`[DevToolRegistry] Tool with id "${def.id}" is already registered. Overwriting.`);
    }
    this.tools.set(def.id, def);
  }

  /**
   * Unregister a dev tool by id
   */
  unregister(id: DevToolId): void {
    this.tools.delete(id);
  }

  /**
   * Get a specific dev tool by id
   */
  get(id: DevToolId): DevToolDefinition | undefined {
    return this.tools.get(id);
  }

  /**
   * Get all registered dev tools
   */
  getAll(): DevToolDefinition[] {
    return Array.from(this.tools.values());
  }

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
   * Clear all registered tools (mainly for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

// Singleton instance
export const devToolRegistry = new DevToolRegistry();
