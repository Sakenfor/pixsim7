import { definePanel } from '../../lib/definePanel';
import { WorldContextPanel } from '@/components/game/panels/WorldContextPanel';

export default definePanel({
  id: 'world-context',
  title: 'World Context',
  component: WorldContextPanel,
  category: 'game',
  tags: ['world', 'location', 'context'],
  icon: 'map',
  description: 'Select active world and location for the editor context.',
  contextLabel: 'world',
  supportsCompactMode: true,
  supportsMultipleInstances: false,
});
