import type { Module } from '@app/modules/types';

export const game2DModule: Module = {
  id: 'game-2d',
  name: '2D Game',
  page: {
    route: '/game-2d',
    icon: 'play',
    description: 'Play the turn-based 2D day cycle game',
    category: 'game',
  },
};

export const simulationModule: Module = {
  id: 'simulation',
  name: 'Simulation Playground',
  page: {
    route: '/simulation',
    icon: 'play',
    description: 'Test and explore simulation features',
    category: 'development',
    hidden: true,
  },
};
