import { definePanel } from '../../../lib/definePanel';

import { PromptLibraryInspectorPanel } from './PromptLibraryInspectorPanel';

export { PromptLibraryInspectorPanel };

export default definePanel({
  id: 'prompt-library-inspector',
  title: 'Prompt Library',
  component: PromptLibraryInspectorPanel,
  category: 'generation',
  tags: ['prompts', 'blocks', 'templates', 'content-packs', 'inspector', 'library'],
  icon: 'library',
  description: 'Inspect content packs, prompt templates, and blocks with package-focused diagnostics.',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
