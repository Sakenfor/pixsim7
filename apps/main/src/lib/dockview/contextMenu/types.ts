/**
 * Dockview Context Menu Types
 *
 * Type definitions for the extensible dockview context menu system.
 * Re-exports shared contract types and defines app-specific concrete types.
 */

import type {
  ContextMenuContext as ContextMenuContextBase,
  MenuActionContextBase,
  MenuActionBase,
  MenuItem as MenuItemBase,
} from '@pixsim7/shared.panels';
import type { DockviewApi } from 'dockview-core';

import type { ContextHubState } from '@features/contextHub';
import type { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import type { DockviewHost } from '../host';

// ─────────────────────────────────────────────────────────────────────────────
// Re-export shared contract types for backwards compatibility
// ─────────────────────────────────────────────────────────────────────────────

export type { ContextMenuContextBase, MenuActionContextBase, MenuActionBase };

/** Context types for different areas where context menu can appear */
export type ContextMenuContext = ContextMenuContextBase;

/** Menu item format for MenuWidget component */
export type MenuItem = MenuItemBase;

// ─────────────────────────────────────────────────────────────────────────────
// Capability Access Patterns
// ─────────────────────────────────────────────────────────────────────────────
//
// There are TWO ways to access capabilities in menu actions:
//
// 1. SNAPSHOT (ctx.capabilities) - Pre-resolved values
//    - Built once when context menu opens
//    - Contains resolved values for all exposed capability keys
//    - Fast, stable, simple to use
//    - Use for: Simple value checks, reading capability data
//
//    Example:
//    ```ts
//    const genContext = ctx.capabilities?.generationContext as GenerationContextSummary | null;
//    if (genContext?.mode === 'quick') { ... }
//    ```
//
// 2. LIVE STATE (ctx.contextHubState) - Full registry chain
//    - Provides access to the actual ContextHubState
//    - Can walk parent chain, query all providers, check isAvailable()
//    - Use for: Introspection, multi-provider scenarios, debugging
//
//    Example:
//    ```ts
//    // Walk the scope chain
//    let current = ctx.contextHubState;
//    while (current) {
//      const providers = current.registry.getAll(key);
//      current = current.parent;
//    }
//    ```
//
// GUIDELINE: Prefer snapshot for most actions. Only use live state when you
// need to enumerate providers, check availability, or walk the scope chain.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * App-specific panel registry interface for context menu actions.
 */
export interface PanelRegistryLike {
  getAll: () => Array<{
    id: string;
    title: string;
    icon?: string;
    category?: string;
    supportsMultipleInstances?: boolean;
  }>;
  getPublicPanels?: () => Array<{
    id: string;
    title: string;
    icon?: string;
    category?: string;
    supportsMultipleInstances?: boolean;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// App-specific concrete types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Concrete context passed to menu actions when executed.
 *
 * This is the app-specific alias with fully typed dockview, context hub,
 * and workspace store references.
 */
export type MenuActionContext = MenuActionContextBase<
  DockviewApi,
  ContextHubState,
  typeof useWorkspaceStore,
  DockviewHost,
  PanelRegistryLike
>;

/**
 * Concrete menu action definition for the context menu registry.
 *
 * Uses the app-specific MenuActionContext for typed callbacks.
 */
export type MenuAction = MenuActionBase<MenuActionContext>;
