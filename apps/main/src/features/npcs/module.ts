/**
 * NPCs Feature Module
 *
 * UI for configuring NPC portraits, expressions, and preferences.
 */

import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import type { Module } from '@app/modules/types';

function NpcPortraitsRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=npc-portraits', replace: true });
}

export const npcsModule: Module = {
  id: 'npcs',
  name: 'NPCs',

  page: {
    route: '/npc-portraits',
    icon: 'user',
    description: 'Configure NPC expressions mapped to assets',
    category: 'game',
    featureId: 'npcs',
    showInNav: false,
    component: NpcPortraitsRedirect,
  },
};
