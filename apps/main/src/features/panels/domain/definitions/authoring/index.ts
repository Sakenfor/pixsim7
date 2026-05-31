import { definePanel } from '../../../lib/definePanel';

import { AuthoringPanel } from './AuthoringPanel';

export { AuthoringPanel };
export { registerAuthoringMethod, listAuthoringMethods } from './methods/registry';
export type { AuthoringMethod, AuthoringMethodProps } from './methods/types';

export default definePanel({
  id: 'authoring',
  title: 'Authoring',
  component: AuthoringPanel,
  category: 'prompts',
  panelRole: 'editor',
  tags: ['blocks', 'authoring', 'prompts', 'cue', 'content-packs', 'packs'],
  icon: 'pencil',
  description:
    'Author prompt packs and block primitives (CUE and more) with embedded Block Explorer for reference.',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  siblings: ['block-explorer', 'block-matrix'],
  consumesCapabilities: ['blockSelection'],
});
