import type { ActionDefinition } from '@pixsim7/shared.types';
import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import { defineModule } from '@app/modules/types';

// === Generation Actions ===

type GenerationControlModule = 'quickGenerate' | 'presets' | 'providers';

async function openGenerationControlModule(module: GenerationControlModule): Promise<void> {
  const [{ useControlCenterStore }, { useDockUiStore }, { DOCK_IDS }] = await Promise.all([
    import('@features/controlCenter/stores/controlCenterStore'),
    import('@features/docks/stores'),
    import('@features/panels/lib/panelIds'),
  ]);

  useControlCenterStore.getState().setActiveModule(module);
  useDockUiStore.getState().setDockOpen(DOCK_IDS.controlCenter, true);
}

const quickGenerateAction: ActionDefinition = {
  id: 'generation.quick-generate',
  featureId: 'generation',
  title: 'Quick Generate',
  description: 'Open quick generate in control center',
  icon: 'zap',
  shortcut: 'Ctrl+G',
  category: 'quick-add',
  execute: () => openGenerationControlModule('quickGenerate'),
};

const openPresetsAction: ActionDefinition = {
  id: 'generation.open-presets',
  featureId: 'generation',
  title: 'Open Presets',
  description: 'Open generation presets',
  icon: 'palette',
  category: 'quick-add',
  execute: () => openGenerationControlModule('presets'),
};

const selectProviderAction: ActionDefinition = {
  id: 'generation.select-provider',
  featureId: 'generation',
  title: 'Select Provider',
  description: 'Select generation provider',
  icon: 'globe',
  category: 'quick-add',
  execute: () => openGenerationControlModule('providers'),
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
  dependsOn: ['workspace', 'generation'],
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
