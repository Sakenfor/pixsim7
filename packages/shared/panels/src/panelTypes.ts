/**
 * Unified Panel Types
 *
 * Shared interfaces for panel definitions and registries.
 * Both LocalPanelRegistry and global PanelRegistry implement these interfaces.
 */

import type { ComponentType } from "react";

export type PanelInstancePolicy = "single" | "multiple" | { max: number };

/**
 * Entity ref type for capability scoping.
 * Matches the entity ref types from @pixsim7/shared.types.
 * Extensible via (string & {}) pattern.
 */
export type CapabilityRefType =
  | "asset"
  | "generation"
  | "scene"
  | "location"
  | "npc"
  | "world"
  | "session"
  | (string & {});

/**
 * Structured capability declaration with optional ref type.
 */
export interface CapabilityDeclarationObject {
  /** Capability key (e.g., "asset:selection", "generation:context") */
  key: string;
  /** Entity ref type this capability is scoped to */
  refType?: CapabilityRefType;
  /** Optional description for tooling */
  description?: string;
}

/**
 * Capability declaration - either a simple string key or a structured object.
 * String form is shorthand for { key: string }.
 */
export type CapabilityDeclaration = string | CapabilityDeclarationObject;

/**
 * Normalize a capability declaration to its object form.
 */
export function normalizeCapabilityDeclaration(
  decl: CapabilityDeclaration
): CapabilityDeclarationObject {
  return typeof decl === "string" ? { key: decl } : decl;
}

/**
 * Extract capability keys from an array of declarations.
 */
export function getCapabilityKeys(
  declarations: CapabilityDeclaration[] | undefined
): string[] {
  if (!declarations) return [];
  return declarations.map((d) => (typeof d === "string" ? d : d.key));
}

export interface PanelAvailabilityPolicy {
  /** Dockview scopes where this panel is available (e.g., "workspace", "control-center") */
  docks?: string[];
}

/**
 * Base panel definition - common fields between local and global panels.
 */
export interface BasePanelDefinition<TParams = any> {
  /** Unique panel ID */
  id: string;
  /** Display title (shown in tabs) */
  title: string;
  /** React component to render */
  component: ComponentType<TParams>;
  /** Icon name for tab/header */
  icon?: string;
  /** Category for grouping in menus (e.g., 'core', 'tools', 'system') */
  category?: string;
  /** Tags for search/filtering */
  tags?: string[];
  /** Short description */
  description?: string;
  /** Display order (lower = earlier) */
  order?: number;
  /** Whether panel is enabled by default */
  enabledByDefault?: boolean;
  /** Hide from add-panel menus (still available in layouts) */
  isInternal?: boolean;
  /** Allow multiple instances of this panel in the same dockview */
  supportsMultipleInstances?: boolean;
  /** Optional instance policy (preferred over supportsMultipleInstances) */
  instances?: PanelInstancePolicy;
  /** Optional instance cap (for future enforcement) */
  maxInstances?: number;
  /**
   * Setting scope IDs this panel participates in.
   * Panels declaring a setting scope will be automatically wrapped with the corresponding
   * scope provider (e.g., "generation" scope wraps with GenerationScopeProvider).
   *
   * This enables automatic per-instance scoping without manual wiring.
   *
   * @example settingScopes: ["generation"] - Panel uses generation stores
   */
  settingScopes?: string[];

  /**
   * @deprecated Use `settingScopes` instead. Will be removed in a future version.
   * Alias for `settingScopes` - scope IDs this panel participates in.
   */
  scopes?: string[];

  /**
   * Optional declarative hint for capabilities this panel consumes.
   * Used by UI tooling (e.g., "Connect" context menu) when runtime
   * consumption has not been recorded yet.
   *
   * Supports both string keys and structured declarations with ref types:
   * @example consumesCapabilities: ["asset:selection"]
   * @example consumesCapabilities: [{ key: "asset:selection", refType: "asset" }]
   */
  consumesCapabilities?: CapabilityDeclaration[];

  /**
   * Optional declarative hint for capabilities this panel provides.
   * Used by UI tooling to show what a panel offers and for
   * dependency validation (ensuring required capabilities have providers).
   *
   * Supports both string keys and structured declarations with ref types:
   * @example providesCapabilities: ["generation:context"]
   * @example providesCapabilities: [{ key: "generation:context", refType: "generation" }]
   */
  providesCapabilities?: CapabilityDeclaration[];

  /**
   * Dockview scope IDs where this panel can appear.
   * Used by SmartDockview's `scope` prop to filter available panels.
   *
   * Common scopes:
   * - "workspace": Main workspace dockview
   * - "control-center": Bottom control center dock
   * - "asset-viewer": Asset viewer side panel
   *
   * If not specified, panel is only available when explicitly listed via `panels` prop.
   *
   * @example availableIn: ["workspace", "control-center"] - Panel shows in workspace and control center
   */
  availableIn?: string[];
  /** Optional availability policy (preferred over availableIn) */
  availability?: PanelAvailabilityPolicy;
}
