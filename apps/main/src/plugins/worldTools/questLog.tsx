/**
 * Quest Log World Tool Plugin
 *
 * Displays active quests and objectives.
 */

import type { WorldToolPlugin } from '../../lib/worldTools/types';
import { QuestLog } from '../../components/game/QuestLog';

export const questLogTool: WorldToolPlugin = {
  id: 'quest-log',
  name: 'Quests',
  description: 'View active quests and objectives',
  icon: '📜',
  category: 'quest',

  // Show when we have a game session
  whenVisible: (context) => context.session !== null,

  render: (context) => {
    return (
      <QuestLog
        session={context.session}
        onClose={() => {
          // Panel handles close via button in WorldToolsPanel
        }}
      />
    );
  },
};
