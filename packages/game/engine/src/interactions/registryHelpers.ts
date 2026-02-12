/**
 * Interaction Plugin Utilities
 *
 * Helper functions for working with interaction plugins dynamically.
 *
 * Extracted from apps/main/src/lib/game/interactions/utils.ts
 */

import { interactionRegistry } from './registry';

/**
 * Get visual metadata for an interaction plugin
 */
export function getInteractionMetadata(interactionId: string) {
  const plugin = interactionRegistry.get(interactionId);

  if (!plugin) {
    return {
      id: interactionId,
      name: interactionId,
      icon: '',
      color: 'blue' as const,
      category: 'unknown',
    };
  }

  // Category-based colors for UI
  const categoryColors: Record<string, 'green' | 'red' | 'orange' | 'blue' | 'purple' | 'yellow'> = {
    social: 'green',
    stealth: 'red',
    combat: 'orange',
    trade: 'blue',
    magic: 'purple',
    skill: 'yellow',
  };

  return {
    id: interactionId,
    name: plugin.name,
    icon: plugin.icon || '',
    color: (plugin.category && categoryColors[plugin.category]) || 'blue',
    category: plugin.category || 'unknown',
  };
}

/**
 * Get all enabled interaction IDs from a slot's interactions
 */
export function getEnabledInteractions(slotInteractions: Record<string, any> | undefined): string[] {
  if (!slotInteractions) return [];

  return Object.entries(slotInteractions)
    .filter(([_, config]) => (config as any)?.enabled)
    .map(([id]) => id);
}

/**
 * Check if a slot has any enabled interactions
 */
export function hasEnabledInteractions(slotInteractions: Record<string, any> | undefined): boolean {
  return getEnabledInteractions(slotInteractions).length > 0;
}

/**
 * Get interaction plugin by ID (async-safe)
 */
export async function getInteractionPlugin(interactionId: string) {
  return interactionRegistry.getAsync(interactionId);
}

/**
 * Get all registered interaction plugins
 */
export function getAllInteractions() {
  return interactionRegistry.getAll();
}
