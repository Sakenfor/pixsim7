import { GizmoSurfacesPanel } from '@features/panels/components/dev/GizmoSurfacesPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'gizmo-surfaces',
  title: 'Gizmo Surfaces',
  component: GizmoSurfacesPanel,
  category: 'dev',
  browsable: false,
  tags: ['gizmos', 'surfaces', 'overlays', 'dashboards', 'debug'],
  icon: 'sliders',
  description: 'Manage gizmo overlays and debug dashboard surfaces',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for gizmo surface management tool.',
  featureHighlights: ['Centralized debugging surface for overlays and gizmo dashboards.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug' },
});
