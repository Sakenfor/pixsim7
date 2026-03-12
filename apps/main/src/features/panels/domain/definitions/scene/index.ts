import { LegacyScenePanel } from '@features/scene';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'scene',
  title: 'Scene Builder',
  component: LegacyScenePanel,
  category: 'scene',
  tags: ['scene', 'builder', 'editor', 'legacy'],
  icon: 'layoutGrid',
  description: 'Legacy entrypoint that opens Scene Management on the Builder tab',
  navigation: {
    modules: ['workspace'],
    order: 110,
    hidden: true,
  },
  contextLabel: 'scene',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
