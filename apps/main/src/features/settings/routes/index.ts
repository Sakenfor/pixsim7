import { lazy } from 'react';

import type { Module } from '@app/modules/types';

export const settingsPageModule: Module = {
  id: 'settings-page',
  name: 'Settings',
  page: {
    route: '/settings',
    icon: 'settings',
    description: 'Application settings and configuration',
    category: 'management',
    featureId: 'settings',
    showInNav: true,
    protected: true,
    component: lazy(() =>
      import('../../../routes/Settings').then((m) => ({ default: m.SettingsRoute })),
    ),
    subNav: [
      { id: 'general', label: 'General', icon: 'settings', route: '/settings' },
      { id: 'plugins', label: 'Plugins', icon: 'package', route: '/plugins' },
      { id: 'generation', label: 'Generation', icon: 'sparkles', route: '/settings?section=generation' },
      { id: 'appearance', label: 'Appearance', icon: 'palette', route: '/settings?section=appearance' },
    ],
  },
};
