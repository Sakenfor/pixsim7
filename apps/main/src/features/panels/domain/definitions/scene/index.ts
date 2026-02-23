import { SceneBuilderPanel } from '@features/scene';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'scene',
  title: 'Scene Builder',
  component: SceneBuilderPanel,
  category: 'scene',
  tags: ['scene', 'builder', 'editor'],
  icon: 'layoutGrid',
  description: 'Build and edit individual scenes',
  navigation: {
    modules: ['workspace'],
    order: 10,
  },
  contextLabel: 'scene',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
