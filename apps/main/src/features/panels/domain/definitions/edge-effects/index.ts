import { EdgeEffectsPanel } from '@features/panels/components/tools/EdgeEffectsPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'edge-effects',
  title: 'Edge Effects',
  component: EdgeEffectsPanel,
  category: 'scene',
  tags: ['scene', 'edges', 'effects', 'relationships', 'quests', 'inventory'],
  icon: 'wand2',
  description: 'Inspect and edit edge effects for the active scene graph.',
  navigation: {
    featureIds: ['game'],
    modules: ['game-2d'],
    order: 40,
  },
  contextLabel: 'scene',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
