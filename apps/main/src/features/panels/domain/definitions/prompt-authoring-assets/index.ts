import { PromptAuthoringAssets } from '@features/prompts/components/authoring/PromptAuthoringAssets';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'prompt-authoring-assets',
  title: 'Version Assets',
  component: PromptAuthoringAssets,
  category: 'generation',
  icon: 'image',
  availableIn: ['prompt-authoring'],
  supportsMultipleInstances: false,
});
