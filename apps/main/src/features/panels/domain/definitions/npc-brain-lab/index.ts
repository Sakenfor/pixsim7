import { NpcBrainLab } from '@features/brainTools';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'npc-brain-lab',
  title: 'NPC Brain Lab',
  component: NpcBrainLab,
  category: 'tools',
  tags: ['npc', 'ai', 'brain', 'behavior'],
  icon: 'bot',
  description: 'NPC behavior testing and debugging',
  navigation: {
    featureIds: ['game'],
    modules: ['game', 'npc-brain-lab', 'npcs', 'interaction-studio'],
    order: 20,
    openPreference: 'route-preferred',
    openRoute: '/npc-brain-lab',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
