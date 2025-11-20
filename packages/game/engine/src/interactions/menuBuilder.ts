/**
 * Interaction Menu Builder
 *
 * Phase 17.4: Unified menu building from multiple sources
 *
 * This module unifies:
 * - Hotspot actions (scene-centric)
 * - Slot plugin interactions (NPC-centric)
 * - Canonical NPC interactions (new system)
 */

import type {
  NpcInteractionInstance,
  NpcInteractionDefinition,
  InteractionSurface,
} from '@pixsim7/shared.types';
import type { HotspotAction } from './hotspot';

/**
 * Menu item that can come from any source
 */
export interface UnifiedMenuItem {
  /** Unique ID for this menu item */
  id: string;

  /** Display label */
  label: string;

  /** Icon/emoji */
  icon?: string;

  /** Surface to use */
  surface: InteractionSurface;

  /** Priority (higher = shown first) */
  priority: number;

  /** Whether this item is available */
  available: boolean;

  /** Disabled reason if unavailable */
  disabledReason?: string;

  /** Source type */
  source: 'hotspot' | 'slot_plugin' | 'canonical_interaction';

  /** Source-specific data */
  sourceData: HotspotAction | CanonicalInteractionItem | SlotPluginItem;
}

/**
 * Canonical interaction item data
 */
export interface CanonicalInteractionItem {
  type: 'canonical';
  instance: NpcInteractionInstance;
}

/**
 * Slot plugin item data
 */
export interface SlotPluginItem {
  type: 'slot_plugin';
  pluginId: string;
  config: Record<string, unknown>;
}

/**
 * Built menu with unified items
 */
export interface InteractionMenuResult {
  /** All menu items */
  items: UnifiedMenuItem[];

  /** Available items only */
  available: UnifiedMenuItem[];

  /** Unavailable items only */
  unavailable: UnifiedMenuItem[];

  /** Items grouped by surface */
  bySurface: Record<InteractionSurface, UnifiedMenuItem[]>;
}

/**
 * Convert hotspot action to menu item
 */
export function hotspotActionToMenuItem(
  action: HotspotAction,
  hotspotId: string,
  priority: number = 0
): UnifiedMenuItem {
  const { type } = action;

  let label = 'Interact';
  let icon: string | undefined;
  let surface: InteractionSurface = 'inline';

  switch (type) {
    case 'play_scene':
      label = 'Start Scene';
      icon = '🎬';
      surface = 'scene';
      break;
    case 'change_location':
      label = 'Go';
      icon = '🚪';
      surface = 'inline';
      break;
    case 'npc_talk':
      label = 'Talk';
      icon = '💬';
      surface = 'dialogue';
      break;
  }

  return {
    id: `hotspot:${hotspotId}:${type}`,
    label,
    icon,
    surface,
    priority,
    available: true,
    source: 'hotspot',
    sourceData: action,
  };
}

/**
 * Convert canonical interaction instance to menu item
 */
export function canonicalInteractionToMenuItem(
  instance: NpcInteractionInstance
): UnifiedMenuItem {
  return {
    id: `canonical:${instance.id}`,
    label: instance.label,
    icon: instance.icon,
    surface: instance.surface,
    priority: instance.priority || 0,
    available: instance.available,
    disabledReason: instance.disabledMessage,
    source: 'canonical_interaction',
    sourceData: {
      type: 'canonical',
      instance,
    },
  };
}

/**
 * Convert slot plugin interaction to menu item
 */
export function slotPluginToMenuItem(
  pluginId: string,
  config: Record<string, unknown>,
  label: string,
  priority: number = 0
): UnifiedMenuItem {
  let icon: string | undefined;
  let surface: InteractionSurface = 'inline';

  // Infer from plugin ID
  switch (pluginId) {
    case 'talk':
      icon = '💬';
      surface = 'dialogue';
      break;
    case 'pickpocket':
      icon = '🤏';
      surface = 'notification';
      break;
    case 'persuade':
      icon = '🗣️';
      surface = 'dialogue';
      break;
    case 'giveItem':
      icon = '🎁';
      surface = 'inline';
      break;
    case 'sensualize':
      icon = '💋';
      surface = 'scene';
      break;
  }

  return {
    id: `plugin:${pluginId}`,
    label,
    icon,
    surface,
    priority,
    available: config.enabled !== false,
    source: 'slot_plugin',
    sourceData: {
      type: 'slot_plugin',
      pluginId,
      config,
    },
  };
}

/**
 * Build unified interaction menu from multiple sources
 */
export function buildInteractionMenu(options: {
  /** Hotspot actions */
  hotspotActions?: Array<{ action: HotspotAction; hotspotId: string }>;

  /** Slot plugin interactions */
  slotPlugins?: Array<{
    pluginId: string;
    config: Record<string, unknown>;
    label: string;
  }>;

  /** Canonical interaction instances */
  canonicalInteractions?: NpcInteractionInstance[];

  /** Sort by priority */
  sortByPriority?: boolean;

  /** Filter to specific surfaces */
  filterSurfaces?: InteractionSurface[];
}): InteractionMenuResult {
  const {
    hotspotActions = [],
    slotPlugins = [],
    canonicalInteractions = [],
    sortByPriority = true,
    filterSurfaces,
  } = options;

  const items: UnifiedMenuItem[] = [];

  // Convert hotspot actions
  for (const { action, hotspotId } of hotspotActions) {
    items.push(hotspotActionToMenuItem(action, hotspotId));
  }

  // Convert slot plugins
  for (const { pluginId, config, label } of slotPlugins) {
    items.push(slotPluginToMenuItem(pluginId, config, label));
  }

  // Convert canonical interactions
  for (const instance of canonicalInteractions) {
    items.push(canonicalInteractionToMenuItem(instance));
  }

  // Filter by surfaces if specified
  let filtered = filterSurfaces
    ? items.filter((item) => filterSurfaces.includes(item.surface))
    : items;

  // Sort by priority (descending), then by label
  if (sortByPriority) {
    filtered.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.label.localeCompare(b.label);
    });
  }

  // Split by availability
  const available = filtered.filter((item) => item.available);
  const unavailable = filtered.filter((item) => !item.available);

  // Group by surface
  const bySurface: Record<InteractionSurface, UnifiedMenuItem[]> = {
    inline: [],
    dialogue: [],
    scene: [],
    notification: [],
    menu: [],
  };

  for (const item of filtered) {
    bySurface[item.surface].push(item);
  }

  return {
    items: filtered,
    available,
    unavailable,
    bySurface,
  };
}

/**
 * Get primary interaction (highest priority available)
 */
export function getPrimaryInteraction(
  menu: InteractionMenuResult
): UnifiedMenuItem | null {
  return menu.available[0] || null;
}

/**
 * Get interactions for a specific surface
 */
export function getInteractionsBySurface(
  menu: InteractionMenuResult,
  surface: InteractionSurface
): UnifiedMenuItem[] {
  return menu.bySurface[surface] || [];
}

/**
 * Check if any dialogue interactions are available
 */
export function hasDialogueInteractions(menu: InteractionMenuResult): boolean {
  return menu.bySurface.dialogue.some((item) => item.available);
}

/**
 * Check if any scene interactions are available
 */
export function hasSceneInteractions(menu: InteractionMenuResult): boolean {
  return menu.bySurface.scene.some((item) => item.available);
}

/**
 * Migration helper: Convert old slot interactions to menu items
 */
export function migrateSlotInteractionsToMenu(slotInteractions: Record<string, any>): UnifiedMenuItem[] {
  const items: UnifiedMenuItem[] = [];

  // Legacy format: { canTalk: true, npcTalk: {...}, canPickpocket: true, pickpocket: {...} }
  if (slotInteractions.canTalk || slotInteractions.talk) {
    const config = slotInteractions.npcTalk || slotInteractions.talk || {};
    items.push(slotPluginToMenuItem('talk', { enabled: true, ...config }, 'Talk', 100));
  }

  if (slotInteractions.canPickpocket || slotInteractions.pickpocket) {
    const config = slotInteractions.pickpocket || {};
    items.push(slotPluginToMenuItem('pickpocket', { enabled: true, ...config }, 'Pickpocket', 50));
  }

  // New format: { talk: { enabled: true, ... }, pickpocket: { enabled: true, ... } }
  for (const [key, value] of Object.entries(slotInteractions)) {
    if (key.startsWith('can') || key === 'npcTalk') continue; // Skip legacy flags
    if (typeof value === 'object' && value !== null) {
      const config = value as Record<string, unknown>;
      if (config.enabled !== false) {
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        items.push(slotPluginToMenuItem(key, config, label));
      }
    }
  }

  return items;
}
