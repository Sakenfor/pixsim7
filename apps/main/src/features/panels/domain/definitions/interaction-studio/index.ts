import { InteractionStudio } from '@/routes/InteractionStudio';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'interaction-studio',
  title: 'Interaction Studio',
  component: InteractionStudio,
  category: 'game',
  tags: ['interaction', 'npc', 'design', 'prototype'],
  icon: 'drama',
  description: 'Design and prototype NPC interactions visually',
  navigation: {
    featureIds: ['game', 'interactions'],
    modules: ['game', 'npc-brain-lab', 'npcs', 'interaction-studio'],
    order: 40,
    openPreference: 'route-preferred',
    openRoute: '/interaction-studio',
  },
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
