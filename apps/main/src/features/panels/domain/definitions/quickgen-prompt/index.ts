import { PromptPanel as QuickGenPromptPanel } from '@features/generation/components/QuickGeneratePanels';
import { QUICKGEN_PROMPT_COMPONENT_ID } from '@features/generation/lib/quickGenerateComponentSettings';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'quickgen-prompt',
  title: 'QuickGen Prompt',
  component: QuickGenPromptPanel,
  category: 'generation',
  tags: ['generation', 'prompt', 'quickgen', 'control-center'],
  icon: 'edit',
  description: 'Prompt editor for quick generation workflows',
  settingScopes: ['generation'],
  componentSettings: [QUICKGEN_PROMPT_COMPONENT_ID],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
