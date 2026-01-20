/**
 * ToolRegistryBase - Abstract base class for UI tool registries
 *
 * Provides shared functionality for Gallery, Brain, and World tool registries:
 * - Tool validation on registration
 * - Category-based filtering
 * - Visibility predicates with error isolation
 *
 * This eliminates code duplication across the three tool registry implementations.
 *
 * ## Domain Clarification
 *
 * This module defines **UI tool plugins** - panels and widgets that render in the
 * application UI (e.g., RelationshipDashboard, QuestLog, LineageViewer).
 *
 * NOT to be confused with:
 * - `InteractiveTool` (scene gizmos) - physical interaction tools in 3D scenes
 * - `RegionDrawer` (viewer/overlay) - drawing tools for image annotation
 * - `BrushConfig` - brush/stroke configuration for drawing
 *
 * @see BaseRegistry for core registry functionality
 * @see docs/guides/registry-patterns.md
 */

import type { ToolPlugin } from '@pixsim7/shared.ui.tools';

import { BaseRegistry } from './BaseRegistry';

// Re-export shared contracts for backwards compatibility
export type { ToolPlugin, UiToolPlugin } from '@pixsim7/shared.ui.tools';

/**
 * Abstract base class for tool registries
 *
 * Provides:
 * - Tool validation on register (requires id, name, render)
 * - Category-based filtering via getByCategory()
 * - Visibility filtering via getVisible() with error isolation
 * - Customizable tool name prefix for log messages
 *
 * Subclasses should:
 * - Define their specific ToolPlugin and Context types
 * - Override toolTypeName for logging (e.g., 'Gallery', 'Brain', 'World')
 * - Add any registry-specific methods (e.g., getBySurface for Gallery)
 */
export abstract class ToolRegistryBase<
  T extends ToolPlugin<TContext>,
  TContext = unknown
> extends BaseRegistry<T> {
  /**
   * Name prefix for log messages (e.g., 'Gallery', 'Brain', 'World')
   * Override in subclasses to customize logging.
   */
  protected abstract readonly toolTypeName: string;

  /**
   * Register a tool plugin
   *
   * Validates that the tool has required fields (id, name, render),
   * logs a warning if overwriting, and registers the tool.
   *
   * @param tool - The tool to register
   * @returns true (always succeeds if validation passes)
   * @throws Error if tool is missing required properties
   */
  register(tool: T): boolean {
    // Validate required fields
    if (!tool.id || !tool.name || !tool.render) {
      throw new Error(
        `${this.toolTypeName} tool must have id, name, and render properties`
      );
    }

    if (this.has(tool.id)) {
      console.warn(
        `${this.toolTypeName} tool "${tool.id}" is already registered. Overwriting.`
      );
    }

    this.forceRegister(tool);
    console.log(`Registered ${this.toolTypeName.toLowerCase()} tool: ${tool.id}`);
    return true;
  }

  /**
   * Get tools by category
   *
   * @param category - The category to filter by
   * @returns Array of tools in the specified category
   */
  getByCategory(category: T['category']): T[] {
    return this.getAll().filter(tool => tool.category === category);
  }

  /**
   * Get visible tools for current context
   *
   * Filters tools using their `whenVisible` predicate.
   * Tools without a predicate are always visible.
   * Errors in predicates are caught and logged, hiding the tool on error.
   *
   * @param context - The context to evaluate visibility against
   * @returns Array of visible tools
   */
  getVisible(context: TContext): T[] {
    return this.getAll().filter(tool => {
      if (!tool.whenVisible) return true;
      try {
        return tool.whenVisible(context);
      } catch (e) {
        console.error(`Error checking visibility for tool ${tool.id}:`, e);
        return false;
      }
    });
  }
}

// ============================================================================
// Type Aliases (preferred names for new code)
// ============================================================================

/**
 * Preferred alias for ToolRegistryBase.
 */
export type UiToolRegistryBase<T extends ToolPlugin<TContext>, TContext = unknown> =
  ToolRegistryBase<T, TContext>;
