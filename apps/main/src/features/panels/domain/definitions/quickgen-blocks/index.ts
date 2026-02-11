import { BlocksPanel as QuickGenBlocksPanel } from '@features/generation/components/QuickGeneratePanels';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'quickgen-blocks',
  title: 'QuickGen Blocks',
  component: QuickGenBlocksPanel,
  category: 'generation',
  tags: ['generation', 'prompt', 'blocks', 'quickgen', 'control-center'],
  icon: 'grid',
  description: 'Prompt companion blocks for quick generation',
  settingScopes: ['generation'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
