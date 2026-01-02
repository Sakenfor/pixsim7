import { definePanel } from '../../../lib/definePanel';
import { GameToolsPanel } from '@features/panels/components/tools/GameToolsPanel';

export default definePanel({
  id: 'game-tools',
  title: 'Game Tools',
  component: GameToolsPanel,
  category: 'tools',
  tags: ['game', 'tools', 'catalog', 'world', 'interactions', 'widgets'],
  icon: 'grid',
  description:
    'Browse world tools, interactions, HUD widgets, and dev plugins',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
