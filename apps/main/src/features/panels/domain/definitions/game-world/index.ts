import { GameWorld } from '@/routes/GameWorld';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'game-world',
  title: 'Game World',
  component: GameWorld,
  category: 'game',
  tags: ['game', 'world', 'locations', 'hotspots', 'presets'],
  icon: 'map',
  description: 'Configure locations and hotspots for 3D scenes',
  navigation: {
    featureIds: ['game'],
    modules: ['game'],
    order: 10,
  },
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
