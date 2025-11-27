/**
 * Dev Tools Types
 *
 * Defines the structure for developer tools that can be registered
 * and displayed in the Dev Tools surface.
 */

export type DevToolId =
  | 'session-state-viewer'
  | 'plugin-workspace'
  | 'dependency-graph'
  | 'app-map'
  | 'generation-debug'
  | string;

export type DevToolCategory =
  | 'session'
  | 'plugins'
  | 'graph'
  | 'generation'
  | 'world'
  | 'debug'
  | 'prompts'
  | 'misc';

export interface DevToolDefinition {
  /** Unique identifier for this dev tool */
  id: DevToolId;

  /** Display label shown in UI */
  label: string;

  /** Optional description of what this tool does */
  description?: string;

  /** Optional icon (emoji or icon name) */
  icon?: string;

  /** Category for grouping and filtering */
  category?: DevToolCategory;

  /** React component used when the tool is shown as a panel */
  panelComponent?: React.ComponentType<any>;

  /** Optional route for full-page dev tools */
  routePath?: string;

  /** Optional tags for filtering/search */
  tags?: string[];

  /** Whether this tool is safe for non-dev users (defaults to false) */
  safeForNonDev?: boolean;
}
