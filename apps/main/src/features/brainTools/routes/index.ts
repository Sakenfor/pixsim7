import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import { defineModule } from '@app/modules/types';

function NpcBrainLabRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=npc-brain-lab', replace: true });
}

export const npcBrainLabModule = defineModule({
  id: 'npc-brain-lab',
  name: 'NPC Brain Lab',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for NPC brain lab route module.',
  featureHighlights: ['NPC brain lab route module now participates in shared latest-update metadata.'],
  page: {
    route: '/npc-brain-lab',
    icon: 'bot',
    description: 'Design and test NPC behavior and AI',
    category: 'game',
    featureId: 'game',
    showInNav: false,
    component: NpcBrainLabRedirect,
  },
});
