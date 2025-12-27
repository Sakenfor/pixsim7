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
  },
};
