import { definePanel } from '../../lib/definePanel';
import { PromptPanel as QuickGenPromptPanel } from '@features/controlCenter/components/QuickGeneratePanels';
import { QUICKGEN_PROMPT_COMPONENT_ID } from '@features/controlCenter/lib/quickGenerateComponentSettings';

export default definePanel({
  id: 'quickgen-prompt',
  title: 'QuickGen Prompt',
  component: QuickGenPromptPanel,
  category: 'generation',
  tags: ['generation', 'prompt', 'quickgen', 'control-center'],
  icon: 'edit',
  description: 'Prompt editor for quick generation workflows',
  availableIn: ['control-center'],
  settingScopes: ['generation'],
  componentSettings: [QUICKGEN_PROMPT_COMPONENT_ID],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
