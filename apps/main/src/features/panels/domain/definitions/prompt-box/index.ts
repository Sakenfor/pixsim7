import { definePanel } from '../../../lib/definePanel';

import { PromptBoxPanel } from './PromptBoxPanel';

export default definePanel({
  id: 'prompt-box',
  title: 'Prompt',
  component: PromptBoxPanel,
  category: 'workspace',
  panelRole: 'sub-panel',
  tags: ['prompt', 'inspect', 'metadata', 'viewer'],
  icon: 'fileText',
  description: 'Read-only prompt inspector for the asset currently in view.',
  consumesCapabilities: ['assetSelection'],
  supportsCompactMode: true,
  supportsMultipleInstances: false,
});
