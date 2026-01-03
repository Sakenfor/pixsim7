import { lazy } from 'react';
import type { Module } from '@app/modules/types';

export const npcBrainLabModule: Module = {
  id: 'npc-brain-lab',
  name: 'NPC Brain Lab',
  page: {
    route: '/npc-brain-lab',
    icon: 'bot',
    description: 'Design and test NPC behavior and AI',
    category: 'game',
    component: lazy(() => import('../components/NpcBrainLab').then(m => ({ default: m.NpcBrainLab }))),
  },
};
