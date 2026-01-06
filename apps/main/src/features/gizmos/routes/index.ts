import { lazy } from 'react';

import type { Module } from '@app/modules/types';

export const gizmoLabModule: Module = {
  id: 'gizmo-lab',
  name: 'Gizmo Lab',
  page: {
    route: '/gizmo-lab',
    icon: 'sparkles',
    iconColor: 'text-purple-500',
    description: 'Explore and test gizmos and interactive tools',
    category: 'development',
    featureId: 'gizmos',
    showInNav: true,
    featurePrimary: true,
    component: lazy(() => import('../../../routes/GizmoLab').then(m => ({ default: m.GizmoLab }))),
  },
};
