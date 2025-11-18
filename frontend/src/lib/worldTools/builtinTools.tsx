import React from 'react';
import { worldToolRegistry } from './registry';
import type { WorldToolPlugin } from './registry';
import { RelationshipDashboard } from '../../components/game/RelationshipDashboard';
import { QuestLog } from '../../components/game/QuestLog';
import { InventoryPanel } from '../../components/game/InventoryPanel';

/**
 * Built-in world tools that are always registered
 */

// Relationships Tool
const relationshipsTool: WorldToolPlugin = {
  id: 'relationships',
  name: 'Relationships',
  description: 'View and track relationships with NPCs',

  render: (context) => {
    return <RelationshipDashboard session={context.session} onClose={context.onClose} />;
  },

  whenVisible: (context) => {
    // Show if session exists and has at least one relationship
    if (!context.session?.relationships) return false;
    return Object.keys(context.session.relationships).length > 0;
  },
};

// Quests Tool
const questsTool: WorldToolPlugin = {
  id: 'quests',
  name: 'Quests',
  description: 'Track active and completed quests',

  render: (context) => {
    return <QuestLog session={context.session} onClose={context.onClose} />;
  },

  whenVisible: (context) => {
    // Show if session exists (quests are fetched dynamically)
    // Could add more sophisticated checks here (e.g., check flags for quest system enabled)
    return context.session !== null;
  },
};

// Inventory Tool
const inventoryTool: WorldToolPlugin = {
  id: 'inventory',
  name: 'Inventory',
  description: 'View and manage inventory items',

  render: (context) => {
    return <InventoryPanel session={context.session} onClose={context.onClose} />;
  },

  whenVisible: (context) => {
    // Show if session exists (inventory is fetched dynamically)
    // Could add more sophisticated checks here (e.g., check flags for inventory system enabled)
    return context.session !== null;
  },
};

/**
 * Register all built-in world tools
 * Call this function early in the app initialization
 */
export function registerBuiltinWorldTools(): void {
  worldToolRegistry.register(relationshipsTool);
  worldToolRegistry.register(questsTool);
  worldToolRegistry.register(inventoryTool);
}
