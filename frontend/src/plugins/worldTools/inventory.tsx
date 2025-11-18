/**
 * Inventory World Tool Plugin
 *
 * Displays player inventory and items.
 */

import type { WorldToolPlugin } from '../../lib/worldTools/types';
import { InventoryPanel } from '../../components/game/InventoryPanel';

export const inventoryTool: WorldToolPlugin = {
  id: 'inventory',
  name: 'Inventory',
  description: 'Manage items and equipment',
  icon: '🎒',
  category: 'inventory',

  // Show when we have a game session
  whenVisible: (context) => context.session !== null,

  render: (context) => {
    return (
      <InventoryPanel
        session={context.session}
        onClose={() => {
          // Panel handles close via button in WorldToolsPanel
        }}
      />
    );
  },
};
