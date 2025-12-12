/**
 * Relationship Dashboard World Tool Plugin
 *
 * Displays NPC relationship tracking and status.
 */

import type { WorldToolPlugin } from '../lib/types';
import { RelationshipDashboard } from '@/components/game/RelationshipDashboard';

export const relationshipDashboardTool: WorldToolPlugin = {
  id: 'relationship-dashboard',
  name: 'Relationships',
  description: 'Track NPC relationships and affinity',
  icon: '💕',
  category: 'character',

  // Show when we have a game session
  whenVisible: (context) => context.session !== null,

  render: (context) => {
    return (
      <RelationshipDashboard
        session={context.session}
        onClose={() => {
          // Panel handles close via button in WorldToolsPanel
        }}
      />
    );
  },
};
