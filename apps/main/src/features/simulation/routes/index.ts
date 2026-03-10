import { lazy } from 'react';

import { defineModule } from '@app/modules/types';

export const game2DModule = defineModule({
  id: 'game-2d',
  name: '2D Game',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for 2D game route module.',
  featureHighlights: ['2D game route module now participates in shared latest-update metadata.'],
  page: {
    route: '/game-2d',
    icon: 'play',
    description: 'Play the turn-based 2D day cycle game',
    category: 'game',
    featureId: 'game',
    component: lazy(() => import('../../../routes/Game2D').then(m => ({ default: m.Game2D }))),
  },
});

export const simulationModule = defineModule({
  id: 'simulation',
  name: 'Simulation Playground',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for simulation playground route module.',
  featureHighlights: ['Simulation route module now participates in shared latest-update metadata.'],
  page: {
    route: '/simulation',
    icon: 'play',
    description: 'Test and explore simulation features',
    category: 'development',
    featureId: 'simulation',
    hidden: true,
    component: lazy(() => import('../../../routes/SimulationPlayground').then(m => ({ default: m.SimulationPlayground }))),
    appMap: {
      docs: ['docs/backend/simulation.md'],
      backend: ['pixsim7.backend.main.services.simulation'],
    },
  },
});
