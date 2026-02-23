import { WorldContextPanel } from '@/components/game/panels/WorldContextPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'world-context',
  title: 'World Context',
  component: WorldContextPanel,
  category: 'game',
  tags: ['world', 'location', 'context'],
  icon: 'map',
  description: 'Select active world and location for the editor context.',
  navigation: {
    featureIds: ['game'],
    modules: ['game', 'game-2d'],
    order: 60,
  },
  contextLabel: 'world',
  supportsCompactMode: true,
  supportsMultipleInstances: false,
});
