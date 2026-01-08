import { z } from 'zod';

/**
 * Canonical Action Types
 *
 * Single source of truth for action definitions across the application.
 * These types feed the capability registry, command palette, context menus,
 * panel actions, and documentation generators.
 *
 * @module @pixsim7/types/actions
 */

// =============================================================================
// Action Visibility
// =============================================================================

/**
 * Controls where an action appears in the UI.
 *
 * - 'always': Show in all applicable contexts (palette, menus, shortcuts)
 * - 'commandPalette': Only show in command palette
 * - 'contextMenu': Only show in context menus
 * - 'hidden': Programmatic-only, never shown in UI
 */
export type ActionVisibility = 'always' | 'commandPalette' | 'contextMenu' | 'hidden';

// =============================================================================
// Action Context
// =============================================================================

/**
 * Source of action invocation for telemetry and behavior branching.
 */
export type ActionSource = 'commandPalette' | 'contextMenu' | 'shortcut' | 'programmatic';

/**
 * Event payload passed to actions.
 *
 * Kept environment-agnostic to avoid DOM typing in shared packages.
 * Browser events can be passed as-is since they are structurally compatible.
 */
export type ActionEvent = {
  type?: string;
  [key: string]: unknown;
};

/**
 * Context passed to action execute functions.
 * Use this instead of `any` for type-safe action handlers.
 */
export interface ActionContext {
  /** How the action was invoked */
  source: ActionSource;

  /** Original event if triggered by user interaction */
  event?: ActionEvent;

  /**
   * Context-specific data (e.g., selected asset, clicked node).
   * Use `unknown` and validate at runtime for type safety.
   */
  target?: unknown;
}

// =============================================================================
// Context Menu Contexts (shared with context menu system)
// =============================================================================

/**
 * Context types for context menu availability filtering.
 * Mirrors ContextMenuContext from dockview/contextMenu/types.ts.
 */
export type ActionMenuContext =
  | 'tab'
  | 'group'
  | 'panel-content'
  | 'background'
  | 'asset'
  | 'asset-card'
  | 'node'
  | 'edge'
  | 'canvas'
  | 'item'
  | 'list-item'
  | (string & {}); // Allow custom contexts from plugins

// =============================================================================
// Action Definition
// =============================================================================

/**
 * Canonical action definition.
 *
 * Modules declare actions using this shape. The capability registry
 * and adapters convert it to runtime formats (ActionCapability, MenuAction, etc.).
 *
 * @example
 * ```typescript
 * const openGalleryAction: ActionDefinition = {
 *   id: 'assets.open-gallery',
 *   featureId: 'assets',
 *   title: 'Open Gallery',
 *   description: 'Open the asset gallery',
 *   icon: 'package',
 *   shortcut: 'Ctrl+Shift+A',
 *   route: '/assets',
 * };
 * ```
 */
export interface ActionDefinition {
  // === Identity ===

  /**
   * Unique action identifier.
   * Convention: namespaced with dots (e.g., 'assets.open-gallery').
   * Plugins may add additional namespace segments.
   */
  id: string;

  /**
   * Parent feature ID (required).
   * Links this action to a feature for grouping and permissions.
   */
  featureId: string;

  // === Display ===

  /**
   * User-facing label shown in command palette and menus.
   * Use title case (e.g., "Open Gallery", not "open gallery").
   */
  title: string;

  /** Optional longer description for tooltips and documentation. */
  description?: string;

  /**
   * Icon identifier.
   * Use icon library names (e.g., 'package', 'settings') not emojis.
   * If emojis are needed, normalize them in adapters or UI renderers.
   */
  icon?: string;

  // === Invocation ===

  /**
   * Keyboard shortcut (e.g., 'Ctrl+Shift+A', 'Cmd+K').
   * Platform-specific variants handled by the shortcut system.
   */
  shortcut?: string;

  /**
   * Action handler.
   * Receives optional ActionContext for source/target information.
   */
  execute: (ctx?: ActionContext) => void | Promise<void>;

  // === Availability ===

  /**
   * Dynamic enable/disable check.
   * Return false to disable the action (grayed out in UI).
   */
  enabled?: () => boolean;

  /**
   * Controls where action appears in UI.
   * @default 'always'
   * Note: not yet consumed by runtime registries.
   */
  visibility?: ActionVisibility;

  /**
   * Context menu contexts where this action should appear.
   * Only relevant when visibility includes context menus.
   */
  contexts?: ActionMenuContext[];

  // === Navigation ===

  /**
   * If this action navigates to a route, declare it here.
   * Used for auto-generating navigation actions and deep linking.
   * Note: not yet consumed by runtime registries.
   */
  route?: string;

  // === Validation ===

  /**
   * Pre-execution validation.
   * Return error message string to block execution, or null/undefined to allow.
   */
  validate?: () => string | null | undefined;

  // === Metadata ===

  /**
   * Category for grouping in command palette.
   * Defaults to feature name if not specified.
   */
  category?: string;

  /** Tags for searchability and filtering. */
  tags?: string[];
}

// =============================================================================
// Module Action Configuration
// =============================================================================

/**
 * Configuration for module-defined actions.
 * Used in Module.page.actions for declarative action registration.
 */
export interface ModuleActionConfig {
  /** Actions provided by this module */
  actions: ActionDefinition[];
}

// =============================================================================
// Runtime Schemas (for validation during registration)
// =============================================================================

const functionSchema = z.any().refine((value) => typeof value === 'function', {
  message: 'Expected function',
});

export const ActionVisibilitySchema = z.enum([
  'always',
  'commandPalette',
  'contextMenu',
  'hidden',
]);

export const ActionDefinitionSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[\w-]+(\.[\w-]+)+$/, 'Expected dot-namespaced action id'),
  featureId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  shortcut: z.string().optional(),
  execute: functionSchema,
  enabled: functionSchema.optional(),
  visibility: ActionVisibilitySchema.optional(),
  contexts: z.array(z.string()).optional(),
  route: z.string().optional(),
  validate: functionSchema.optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
