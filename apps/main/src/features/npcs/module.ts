/**
 * NPCs Feature Module
 *
 * UI for configuring NPC portraits, expressions, and preferences.
 */

import { lazy } from 'react';

import type { Module } from '@app/modules/types';

export const npcsModule: Module = {
  id: 'npcs',
  name: 'NPCs',

  page: {
    route: '/npc-portraits',
    icon: 'user',
    description: 'Configure NPC expressions mapped to assets',
    category: 'game',
    featureId: 'npcs',
    component: lazy(() =>
      import('./routes/NpcPortraits').then((m) => ({ default: m.NpcPortraits }))
    ),
  },
};
