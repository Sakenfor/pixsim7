import { GizmoPlayground } from '@features/gizmos/components/lab/GizmoPlayground';
import { GizmoPlaygroundSettings } from '@features/gizmos/components/lab/GizmoPlaygroundSettings';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'gizmo-playground',
  title: 'Gizmo Playground',
  component: GizmoPlayground,
  category: 'tools',
  tags: ['gizmos', 'lab', 'playground', 'canvas'],
  icon: 'play',
  description: 'Interactive playground for the selected gizmo',
  availableIn: ['gizmo-lab'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  settingsSections: [
    {
      id: 'detection',
      title: 'Zone Detection',
      component: GizmoPlaygroundSettings,
    },
  ],
});
