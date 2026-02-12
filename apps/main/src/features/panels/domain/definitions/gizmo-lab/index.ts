import { GizmoLab } from '@/routes/GizmoLab';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'gizmo-lab',
  title: 'Gizmo Lab',
  component: GizmoLab,
  category: 'tools',
  tags: ['gizmos', 'lab', 'experimental', 'testing'],
  icon: 'wrench',
  description: 'Gizmo testing laboratory',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  orchestration: {
    type: 'dockview-container',
    defaultZone: 'center',
    canChangeZone: true,
    dockview: {
      hasDockview: true,
      subPanelsCanBreakout: true,
      persistLayout: true,
      storageKey: 'gizmo-lab-dockview-layout:v1',
    },
  },
});
