import { GizmoBrowser } from '@features/gizmos/components/lab/GizmoBrowser';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'gizmo-browser',
  title: 'Gizmo Browser',
  component: GizmoBrowser,
  category: 'tools',
  tags: ['gizmos', 'lab', 'browser'],
  icon: 'grid',
  description: 'Browse and select gizmos from the registry',
  availableIn: ['gizmo-lab'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
