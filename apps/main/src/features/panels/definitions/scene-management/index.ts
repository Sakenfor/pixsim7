import { definePanel } from '../../lib/definePanel';
import { SceneManagementPanel } from '@features/scene';

export default definePanel({
  id: 'scene-management',
  title: 'Scene Management',
  component: SceneManagementPanel,
  category: 'scene',
  tags: ['scene', 'management', 'workflow', 'organization'],
  icon: 'folderTree',
  description: 'Unified scene workflow management',
  contextLabel: 'scene',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
