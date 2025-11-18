import type { GameSessionDTO } from '@pixsim7/ui';

/**
 * Context provided to world tool plugins for rendering and visibility checks
 */
export interface WorldToolContext {
  session: GameSessionDTO | null;
  onClose?: () => void;
}

/**
 * A world tool plugin that can be rendered in the game UI
 */
export interface WorldToolPlugin {
  /** Unique identifier for this tool */
  id: string;

  /** Display name shown in UI */
  name: string;

  /** Brief description of what this tool does */
  description: string;

  /**
   * Render the tool UI
   * @param context - The current game context
   * @returns React component to render
   */
  render: (context: WorldToolContext) => React.ReactNode;

  /**
   * Determine if this tool should be visible given the current context
   * @param context - The current game context
   * @returns true if the tool should be shown, false otherwise
   */
  whenVisible?: (context: WorldToolContext) => boolean;
}

/**
 * Registry for managing world tool plugins
 */
class WorldToolRegistry {
  private tools = new Map<string, WorldToolPlugin>();

  /**
   * Register a new world tool plugin
   * @param tool - The tool to register
   */
  register(tool: WorldToolPlugin): void {
    if (this.tools.has(tool.id)) {
      console.warn(`World tool with id "${tool.id}" is already registered. Overwriting.`);
    }
    this.tools.set(tool.id, tool);
  }

  /**
   * Unregister a world tool plugin
   * @param id - The id of the tool to unregister
   */
  unregister(id: string): void {
    this.tools.delete(id);
  }

  /**
   * Get a specific tool by id
   * @param id - The tool id
   * @returns The tool plugin or undefined if not found
   */
  get(id: string): WorldToolPlugin | undefined {
    return this.tools.get(id);
  }

  /**
   * Get all registered tools
   * @returns Array of all registered tools
   */
  getAll(): WorldToolPlugin[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all visible tools for the given context
   * @param context - The current game context
   * @returns Array of tools that should be visible
   */
  getVisible(context: WorldToolContext): WorldToolPlugin[] {
    return this.getAll().filter(tool => {
      // If no visibility check defined, assume always visible
      if (!tool.whenVisible) return true;

      try {
        return tool.whenVisible(context);
      } catch (error) {
        console.error(`Error checking visibility for tool "${tool.id}":`, error);
        return false;
      }
    });
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }
}

// Export singleton instance
export const worldToolRegistry = new WorldToolRegistry();
