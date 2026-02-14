import type { ActionDefinition } from '@pixsim7/shared.types';
import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

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
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    navigateTo('/workspace?openPanel=gizmo-lab');
  },
};

function GizmoLabRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=gizmo-lab', replace: true });
}

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
    showInNav: false,
    featurePrimary: true,
    component: GizmoLabRedirect,
    actions: [openGizmoLabAction],
    appMap: {
      docs: ['docs/ui/GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md'],
      frontend: [
        'apps/main/src/features/gizmos/',
        'apps/main/src/lib/game/gizmos/',
        'packages/interaction/gizmos/',
      ],
    },
  },
};
