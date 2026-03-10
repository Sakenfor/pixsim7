import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import { defineModule } from '@app/modules/types';

// Redirect component for /settings/overlays -> /devtools
function OverlayConfigRedirect() {
  return createElement(Navigate, {
    to: '/devtools',
    replace: true,
  });
}

export const overlayConfigModule = defineModule({
  id: 'overlay-config',
  name: 'Overlay Configuration',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for overlay configuration route module.',
  featureHighlights: ['Overlay config route module now participates in shared latest-update metadata.'],
  page: {
    route: '/settings/overlays',
    icon: 'settings',
    iconColor: 'text-blue-500',
    description: 'Customize overlay positioning and styling for all components',
    category: 'management',
    featureId: 'overlay-config',
    hidden: true,
    component: OverlayConfigRedirect,
  },
});
