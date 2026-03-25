import { GameToolsPanel } from '@features/panels/components/tools/GameToolsPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'game-tools',
  title: 'Game Tools',
  component: GameToolsPanel,
  category: 'tools',
  tags: ['game', 'tools', 'catalog', 'world', 'interactions', 'widgets'],
  icon: 'box',
  description:
    'Browse world tools, interactions, HUD widgets, and dev plugins',
  navigation: {
    featureIds: ['game'],
    modules: ['game', 'game-2d'],
    order: 80,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
