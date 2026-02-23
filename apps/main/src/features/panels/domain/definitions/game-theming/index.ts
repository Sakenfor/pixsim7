import { GameThemingPanel } from '@/components/game/panels/GameThemingPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'game-theming',
  title: 'Game Theming',
  component: GameThemingPanel,
  category: 'game',
  tags: ['theming', 'customization', 'appearance'],
  icon: 'palette',
  description: 'Game theme and appearance customization',
  navigation: {
    featureIds: ['game'],
    modules: ['game', 'game-2d'],
    order: 50,
  },
  contextLabel: 'world',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
