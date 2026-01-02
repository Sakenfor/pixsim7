import type { Module } from '@app/modules/types';

export const overlayConfigModule: Module = {
  id: 'overlay-config',
  name: 'Overlay Configuration',
  page: {
    route: '/settings/overlays',
    icon: 'settings',
    iconColor: 'text-blue-500',
    description: 'Customize overlay positioning and styling for all components',
    category: 'management',
    featured: true,
  },
};
