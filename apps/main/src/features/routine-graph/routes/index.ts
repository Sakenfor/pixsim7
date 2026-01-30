/**
 * Routine Graph Routes
 *
 * Page module definitions for the routine graph editor.
 */

import { lazy } from 'react';

import type { Module } from '@app/modules/types';

export const routineGraphPageModule: Module = {
  id: 'routine-graph-page',
  name: 'Routine Graph Editor',
  page: {
    route: '/routine-graph',
    icon: 'clock',
    iconColor: 'text-blue-500',
    description: 'Design NPC daily routines and schedules',
    category: 'creation',
    featureId: 'routine-graph',
    featurePrimary: true,
    featured: true,
    component: lazy(() =>
      import('./RoutineGraphRoute').then((m) => ({ default: m.RoutineGraphRoute }))
    ),
    appMap: {
      docs: ['docs/architecture/subsystems/npc-architecture.md'],
      backend: [
        'pixsim7.backend.main.domain.game.behavior.routine_resolver',
        'pixsim7.backend.main.domain.game.schemas.behavior',
        'pixsim7.backend.main.api.v1.game_behavior',
      ],
    },
  },
};
