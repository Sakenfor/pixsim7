/**
 * Routine Graph Routes
 *
 * Page module definitions for the routine graph editor.
 */

import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import { defineModule } from '@app/modules/types';

function RoutineGraphRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=routine-graph', replace: true });
}

export const routineGraphPageModule = defineModule({
  id: 'routine-graph-page',
  name: 'Routine Graph Editor',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for routine graph page route module.',
  featureHighlights: ['Routine graph page module now participates in shared latest-update metadata.'],
  page: {
    route: '/routine-graph',
    icon: 'clock',
    iconColor: 'text-blue-500',
    description: 'Design NPC daily routines and schedules',
    category: 'creation',
    featureId: 'routine-graph',
    featurePrimary: true,
    featured: true,
    showInNav: false,
    component: RoutineGraphRedirect,
    appMap: {
      docs: ['docs/architecture/subsystems/npc-architecture.md'],
      backend: [
        'pixsim7.backend.main.domain.game.behavior.routine_resolver',
        'pixsim7.backend.main.domain.game.schemas.behavior',
        'pixsim7.backend.main.api.v1.game_behavior',
      ],
    },
  },
});
