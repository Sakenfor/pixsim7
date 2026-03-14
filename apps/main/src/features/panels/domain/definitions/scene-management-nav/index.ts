import { SceneManagementNavPanel } from '@features/scene/components/panels/SceneManagementNavPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'scene-management-nav',
  title: 'Scene Navigation',
  component: SceneManagementNavPanel,
  category: 'scene',
  icon: 'folderTree',
  description: 'Detached scene management navigation sidebar',
  internal: true,
  supportsMultipleInstances: false,
});
