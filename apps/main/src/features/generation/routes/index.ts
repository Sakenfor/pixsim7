import type { ActionDefinition } from '@pixsim7/shared.types';
import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';

import { defineModule } from '@app/modules/types';

// === Generation Actions ===

const quickGenerateAction: ActionDefinition = {
  id: 'generation.quick-generate',
  featureId: 'generation',
  title: 'Quick Generate',
  description: 'Open quick generate in control center',
  icon: 'zap',
  shortcut: 'Ctrl+G',
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    useControlCenterStore.getState().setActiveModule('quickGenerate');
    useControlCenterStore.getState().setOpen(true);
  },
};

const openPresetsAction: ActionDefinition = {
  id: 'generation.open-presets',
  featureId: 'generation',
  title: 'Open Presets',
  description: 'Open generation presets',
  icon: 'palette',
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    useControlCenterStore.getState().setActiveModule('presets');
    useControlCenterStore.getState().setOpen(true);
  },
};

const selectProviderAction: ActionDefinition = {
  id: 'generation.select-provider',
  featureId: 'generation',
  title: 'Select Provider',
  description: 'Select generation provider',
  icon: 'globe',
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    useControlCenterStore.getState().setActiveModule('providers');
    useControlCenterStore.getState().setOpen(true);
  },
};

function GenerationRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=quickgen-asset', replace: true });
}

export const generationPageModule = defineModule({
  id: 'generation-page',
  name: 'Generation',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for generation route module.',
  featureHighlights: ['Generation route module now participates in shared latest-update metadata.'],
  page: {
    route: '/generate',
    icon: 'sparkles',
    description: 'Quick generation interface',
    category: 'creation',
    featureId: 'generation',
    featurePrimary: true,
    hidden: true,
    showInNav: true,
    protected: true,
    component: GenerationRedirect,
    actions: [quickGenerateAction, openPresetsAction, selectProviderAction],
    appMap: {
      docs: [
        'docs/systems/generation/overview.md',
        'docs/systems/generation/GENERATION_GUIDE.md',
      ],
      backend: [
        'pixsim7.backend.main.api.v1.generations',
        'pixsim7.backend.main.services.generation',
      ],
    },
  },
});
