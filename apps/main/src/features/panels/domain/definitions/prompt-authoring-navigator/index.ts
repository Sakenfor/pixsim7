import { PromptAuthoringNavigator } from '@features/prompts/components/authoring/PromptAuthoringNavigator';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'prompt-authoring-navigator',
  title: 'Prompt Navigator',
  component: PromptAuthoringNavigator,
  category: 'generation',
  icon: 'list',
  availableIn: ['prompt-authoring'],
  supportsMultipleInstances: false,
});
