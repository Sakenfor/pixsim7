import { GameViewPanel } from '@/components/game/panels/GameViewPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'game',
  title: 'Game',
  component: GameViewPanel,
  category: 'game',
  tags: ['game', 'preview', 'play'],
  icon: 'gamepad',
  description: 'Core Game View (Game2D) embedded in the workspace.',
  navigation: {
    featureIds: ['game'],
    modules: ['game-2d'],
    order: 10,
  },
  coreEditorRole: 'game-view',
  contextLabel: 'session',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
