import { PromptResolverWorkbenchPanel } from '@/features/promptResolverWorkbench';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'prompt-resolver-workbench',
  title: 'Prompt Resolver Workbench',
  component: PromptResolverWorkbenchPanel,
  category: 'prompts',
  panelRole: 'debug',
  tags: ['prompts', 'resolver', 'workbench', 'blocks', 'debug', 'experimental'],
  icon: 'beaker',
  description:
    'Fixture-backed workbench for inspecting ResolutionRequest/Result/Trace and experimenting with next_v1 resolver behavior.',
  supportsCompactMode: false,
  supportsMultipleInstances: true,
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'right',
    canChangeZone: true,
    preferredWidth: 620,
  },
});
