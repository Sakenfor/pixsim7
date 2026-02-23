import { SceneManagementPanel } from '@features/scene';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'scene-management',
  title: 'Scene Management',
  component: SceneManagementPanel,
  category: 'scene',
  tags: ['scene', 'management', 'workflow', 'organization'],
  icon: 'folderTree',
  description: 'Unified scene workflow management',
  navigation: {
    modules: ['workspace'],
    order: 20,
  },
  contextLabel: 'scene',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
