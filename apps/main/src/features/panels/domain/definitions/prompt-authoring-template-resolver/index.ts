import { PromptAuthoringTemplateResolver } from '@features/prompts/components/authoring/PromptAuthoringTemplateResolver';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'prompt-authoring-template-resolver',
  title: 'Template Resolver',
  component: PromptAuthoringTemplateResolver,
  category: 'generation',
  panelRole: 'sub-panel',
  browsable: false,
  icon: 'code',
  availableIn: ['prompt-authoring'],
  supportsMultipleInstances: false,
});
