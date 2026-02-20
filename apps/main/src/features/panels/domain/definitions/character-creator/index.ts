import { CharacterCreator } from '@features/characters';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'character-creator',
  title: 'Character Creator',
  component: CharacterCreator,
  category: 'game',
  tags: ['character', 'creator', 'registry', 'npc'],
  icon: 'user',
  description: 'Create and manage reusable character definitions',
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  providesCapabilities: ['characterContext'],
});
