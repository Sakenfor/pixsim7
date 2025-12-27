import { definePanel } from '../../lib/definePanel';
import { GameThemingPanel } from '@/components/game/panels/GameThemingPanel';

export default definePanel({
  id: 'game-theming',
  title: 'Game Theming',
  component: GameThemingPanel,
  category: 'game',
  tags: ['theming', 'customization', 'appearance'],
  icon: 'palette',
  description: 'Game theme and appearance customization',
  contextLabel: 'world',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
