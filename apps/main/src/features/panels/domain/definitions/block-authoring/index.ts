import { definePanel } from '../../../lib/definePanel';

import { BlockAuthoringPanel } from './BlockAuthoringPanel';

export { BlockAuthoringPanel };
export { registerBlockAuthoringMethod, listBlockAuthoringMethods } from './methods/registry';
export type { BlockAuthoringMethod, BlockAuthoringMethodProps } from './methods/types';

export default definePanel({
  id: 'block-authoring',
  title: 'Block Authoring',
  component: BlockAuthoringPanel,
  category: 'prompts',
  panelRole: 'editor',
  tags: ['blocks', 'authoring', 'prompts', 'cue', 'content-packs'],
  icon: 'pencil',
  description:
    'Author block primitives (CUE packs and more) with embedded Block Explorer for reference.',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  siblings: ['block-explorer', 'block-matrix'],
  consumesCapabilities: ['blockSelection'],
});
