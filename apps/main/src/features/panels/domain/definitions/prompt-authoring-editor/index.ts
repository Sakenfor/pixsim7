import { PromptAuthoringEditor } from '@features/prompts/components/authoring/PromptAuthoringEditor';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'prompt-authoring-editor',
  title: 'Prompt Editor',
  component: PromptAuthoringEditor,
  category: 'generation',
  panelRole: 'sub-panel',
  browsable: false,
  icon: 'edit',
  availableIn: ['prompt-authoring'],
  supportsMultipleInstances: false,
});
