/**
 * Control Center Panel Registry
 *
 * Registers Control Center modules as panels for use with SmartDockview.
 * This replaces the custom module system with the standard dockview pattern.
 */

import { createLocalPanelRegistry } from '@lib/dockview/LocalPanelRegistry';
import type { LocalPanelDefinition } from '@lib/dockview/types';

// CC panel IDs
export type CCPanelId =
  | 'quickGenerate'
  | 'presets'
  | 'providers'
  | 'panels'
  | 'gallery'
  | 'workspace'
  | 'plugins';

// Create the CC panel registry
export const ccPanelRegistry = createLocalPanelRegistry<CCPanelId>();

// Panel definitions will be registered by modules via registerCCPanel
export interface CCPanelDefinition extends LocalPanelDefinition {
  id: CCPanelId;
  /** Icon (emoji or lucide icon name) */
  icon?: string;
  /** Category for organization */
  category?: 'core' | 'system' | 'tools' | 'custom';
  /** Display order (lower = earlier) */
  order?: number;
  /** Whether module is enabled by default */
  enabledByDefault?: boolean;
  /** Short description */
  description?: string;
  /** Tags for search/filtering */
  tags?: string[];
  /** Scope IDs for automatic scope provider wrapping */
  scopes?: string[];
}

// Store full definitions for toolbar/metadata access
const fullDefinitions = new Map<CCPanelId, CCPanelDefinition>();

/**
 * Register a CC panel (called by modules during initialization)
 */
export function registerCCPanel(definition: CCPanelDefinition): void {
  // Store full definition for metadata
  fullDefinitions.set(definition.id, definition);

  // Register with the dockview registry (LocalPanelRegistry)
  ccPanelRegistry.register({
    id: definition.id,
    title: definition.title,
    component: definition.component,
    scopes: definition.scopes,
    tags: definition.tags,
    category: definition.category,
  });
}

/**
 * Get full CC panel definition (includes icon, order, etc.)
 */
export function getCCPanelDefinition(id: CCPanelId): CCPanelDefinition | undefined {
  return fullDefinitions.get(id);
}

/**
 * Get all CC panel definitions sorted by order
 */
export function getCCPanelDefinitions(): CCPanelDefinition[] {
  return Array.from(fullDefinitions.values()).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/**
 * Get enabled CC panel definitions based on user preferences
 */
export function getEnabledCCPanels(enabledIds?: string[]): CCPanelDefinition[] {
  const all = getCCPanelDefinitions();

  if (!enabledIds) {
    // Return all enabled by default
    return all.filter((p) => p.enabledByDefault !== false);
  }

  // Filter by user preferences
  const enabledSet = new Set(enabledIds);
  return all.filter((p) => enabledSet.has(p.id));
}
