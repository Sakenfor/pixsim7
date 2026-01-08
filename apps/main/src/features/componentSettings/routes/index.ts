import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import type { Module } from '@app/modules/types';

// Redirect component for /settings/overlays -> /dev/widget-builder?surface=overlay
function OverlayConfigRedirect() {
  return createElement(Navigate, {
    to: '/dev/widget-builder?surface=overlay',
    replace: true,
  });
}

export const overlayConfigModule: Module = {
  id: 'overlay-config',
  name: 'Overlay Configuration',
  page: {
    route: '/settings/overlays',
    icon: 'settings',
    iconColor: 'text-blue-500',
    description: 'Customize overlay positioning and styling for all components',
    category: 'management',
    featureId: 'overlay-config',
    featured: true,
    component: OverlayConfigRedirect,
  },
};
