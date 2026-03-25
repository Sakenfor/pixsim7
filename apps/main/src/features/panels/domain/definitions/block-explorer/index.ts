import { definePanel } from '../../../lib/definePanel';

import { BlockExplorerPanel } from './BlockExplorerPanel';

export { BlockExplorerPanel };

export default definePanel({
  id: 'block-explorer',
  title: 'Block Explorer',
  component: BlockExplorerPanel,
  category: 'prompts',
  panelRole: 'reference',
  tags: ['blocks', 'prompts', 'content-packs', 'explorer', 'generation'],
  icon: 'blocks',
  description: 'Browse and search prompt blocks from content packs',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
