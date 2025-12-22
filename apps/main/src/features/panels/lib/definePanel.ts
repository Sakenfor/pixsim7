/**
 * Panel Definition Helper
 *
 * Simplified API for defining panels with auto-discovery support.
 * Each panel is self-contained in a single file with all its configuration.
 *
 * @example
 * ```typescript
 * // panels/interactive-surface/index.ts
 * import { definePanel } from '@features/panels/lib/definePanel';
 * import { InteractiveSurfacePanel } from './InteractiveSurfacePanel';
 *
 * export default definePanel({
 *   id: 'interactive-surface',
 *   title: 'Interactive Surface',
 *   category: 'tools',
 *   component: InteractiveSurfacePanel,
 *   contexts: ['asset-viewer'],
 *   showWhen: (ctx) => !!ctx.currentAsset,
 * });
 * ```
 */

import type { ComponentType } from 'react';
import type { PanelDefinition, PanelCategory, WorkspaceContext } from './panelRegistry';
import type { PanelOrchestrationMetadata } from './panelRegistry';

/**
 * Simplified panel definition options.
 * Provides sensible defaults and cleaner API than raw PanelDefinition.
 */
export interface DefinePanelOptions<TSettings = any> {
  // Required
  id: string;
  title: string;
  component: ComponentType<any>;

  // Categorization (with defaults)
  category?: PanelCategory;
  tags?: string[];
  icon?: string;
  description?: string;

  // Context binding - which dockviews/contexts this panel can appear in
  // e.g., ['asset-viewer', 'workspace', 'control-center']
  contexts?: string[];

  // Visibility
  showWhen?: (context: WorkspaceContext) => boolean;
  requiresContext?: boolean;

  // Capabilities
  supportsCompactMode?: boolean;
  supportsMultipleInstances?: boolean;

  // Settings
  defaultSettings?: TSettings;
  settingsVersion?: number;

  // Orchestration
  orchestration?: PanelOrchestrationMetadata;

  // Internal panel (hidden from user lists)
  internal?: boolean;
}

/**
 * Panel module structure for auto-discovery.
 * Each panel file/folder exports this structure.
 */
export interface PanelModule {
  /** The panel definition */
  default: PanelDefinition;
  /** Optional: The panel component (for lazy loading) */
  Component?: ComponentType<any>;
}

/**
 * Define a panel with simplified options.
 * Returns a full PanelDefinition compatible with the registry.
 */
export function definePanel<TSettings = any>(
  options: DefinePanelOptions<TSettings>
): PanelDefinition<TSettings> {
  const {
    id,
    title,
    component,
    category = 'tools',
    tags = [],
    icon,
    description,
    contexts = [],
    showWhen,
    requiresContext = false,
    supportsCompactMode = false,
    supportsMultipleInstances = false,
    defaultSettings,
    settingsVersion,
    orchestration,
    internal = false,
  } = options;

  // Auto-generate tags from contexts if not provided
  const derivedTags = [...tags];
  if (contexts.length > 0 && !tags.some((t) => contexts.includes(t))) {
    derivedTags.push(...contexts);
  }

  return {
    id: id as any, // Cast to PanelId
    title,
    component,
    category,
    tags: derivedTags,
    icon,
    description,
    showWhen,
    requiresContext,
    supportsCompactMode,
    supportsMultipleInstances,
    defaultSettings,
    settingsVersion,
    orchestration,
    isInternal: internal,

    // Map contexts to availableIn for SmartDockview scope filtering
    availableIn: contexts.length > 0 ? contexts : undefined,

    // Store contexts in metadata for legacy filtering
    metadata: {
      contexts,
    },
  } as PanelDefinition<TSettings>;
}

/**
 * Get contexts from a panel definition.
 * Used by dockviews to filter which panels to include.
 */
export function getPanelContexts(panel: PanelDefinition): string[] {
  return (panel as any).metadata?.contexts ?? [];
}

/**
 * Check if a panel belongs to a specific context.
 */
export function panelBelongsToContext(
  panel: PanelDefinition,
  context: string
): boolean {
  const contexts = getPanelContexts(panel);
  // If no contexts specified, panel is available everywhere
  if (contexts.length === 0) return true;
  return contexts.includes(context);
}
