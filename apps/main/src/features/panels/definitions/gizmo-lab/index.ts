import { definePanel } from '../../lib/definePanel';
import { GizmoLab } from '@/routes/GizmoLab';

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
});
