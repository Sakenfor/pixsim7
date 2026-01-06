import type { ActionDefinition } from '@shared/types';
import { lazy } from 'react';

import { ROUTES, navigateTo } from '@lib/capabilities/routeConstants';

import type { Module } from '@app/modules/types';

// === Gizmos Actions ===

const openGizmoLabAction: ActionDefinition = {
  id: 'gizmos.open-lab',
  featureId: 'gizmos',
  title: 'Open Gizmo Lab',
  description: 'Open the gizmo lab',
  icon: 'sparkles',
  route: ROUTES.GIZMO_LAB,
  execute: () => {
    navigateTo(ROUTES.GIZMO_LAB);
  },
};

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
    actions: [openGizmoLabAction],
  },
};
