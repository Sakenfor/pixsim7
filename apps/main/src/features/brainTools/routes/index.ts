import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import type { Module } from '@app/modules/types';

function NpcBrainLabRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=npc-brain-lab', replace: true });
}

export const npcBrainLabModule: Module = {
  id: 'npc-brain-lab',
  name: 'NPC Brain Lab',
  page: {
    route: '/npc-brain-lab',
    icon: 'bot',
    description: 'Design and test NPC behavior and AI',
    category: 'game',
    featureId: 'game',
    showInNav: false,
    component: NpcBrainLabRedirect,
  },
};
