import { NpcPortraits } from '@features/npcs/routes/NpcPortraits';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'npc-portraits',
  title: 'NPC Portraits',
  component: NpcPortraits,
  category: 'game',
  tags: ['npc', 'portraits', 'expressions', 'preferences'],
  icon: 'user',
  description: 'Configure NPC expressions mapped to assets',
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
