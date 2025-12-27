import type { Module } from '@app/modules/types';

export const npcPortraitsModule: Module = {
  id: 'npc-portraits',
  name: 'NPC Portraits',
  page: {
    route: '/npc-portraits',
    icon: 'user',
    description: 'Configure NPC expressions mapped to assets',
    category: 'game',
  },
};
