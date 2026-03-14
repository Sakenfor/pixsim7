import { PromptAuthoringWorkbenchHost } from '@features/prompts/components/authoring/PromptAuthoringWorkbenchHost';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'prompt-authoring',
  title: 'Prompt Authoring',
  component: PromptAuthoringWorkbenchHost,
  category: 'generation',
  tags: ['prompts', 'authoring', 'versioning', 'editor', 'quickgen'],
  icon: 'gitBranch',
  description: 'Version-aware prompt authoring with integrated generation.',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  orchestration: {
    type: 'dockview-container',
    defaultZone: 'center',
    canChangeZone: true,
    dockview: {
      hasDockview: true,
      subPanelsCanBreakout: true,
      persistLayout: true,
      storageKey: 'dockview:prompt-authoring:v1',
    },
  },
});
