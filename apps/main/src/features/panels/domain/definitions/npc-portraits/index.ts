import { NpcPortraits } from '@features/npcs/routes/NpcPortraits';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'npc-portraits',
  title: 'NPC Portraits',
  component: NpcPortraits,
  category: 'game',
  tags: ['npc', 'portraits', 'expressions', 'preferences'],
  icon: 'users',
  description: 'Configure NPC expressions mapped to assets',
  navigation: {
    featureIds: ['game'],
    modules: ['game', 'npc-brain-lab', 'npcs', 'interaction-studio'],
    order: 30,
    openPreference: 'route-preferred',
    openRoute: '/npc-portraits',
  },
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
