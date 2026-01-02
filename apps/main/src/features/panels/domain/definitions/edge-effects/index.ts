import { definePanel } from '../../../lib/definePanel';
import { EdgeEffectsPanel } from '@features/panels/components/tools/EdgeEffectsPanel';

export default definePanel({
  id: 'edge-effects',
  title: 'Edge Effects',
  component: EdgeEffectsPanel,
  category: 'scene',
  tags: ['scene', 'edges', 'effects', 'relationships', 'quests', 'inventory'],
  icon: 'zap',
  description: 'Inspect and edit edge effects for the active scene graph.',
  contextLabel: 'scene',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
