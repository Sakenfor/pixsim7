/**
 * NPCs Feature Module
 *
 * UI for configuring NPC portraits, expressions, and preferences.
 */

import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import { defineModule } from '@app/modules/types';

function NpcPortraitsRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=npc-portraits', replace: true });
}

export const npcsModule = defineModule({
  id: 'npcs',
  name: 'NPCs',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for NPC feature module.',
  featureHighlights: ['NPC module now participates in shared latest-update metadata.'],
  dependsOn: ['workspace'],

  page: {
    route: '/npc-portraits',
    icon: 'user',
    description: 'Configure NPC expressions mapped to assets',
    category: 'game',
    featureId: 'npcs',
    showInNav: false,
    component: NpcPortraitsRedirect,
  },
});
