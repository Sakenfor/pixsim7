import { definePanel } from '../../lib/definePanel';
import { BlocksPanel as QuickGenBlocksPanel } from '@features/controlCenter/components/QuickGeneratePanels';

export default definePanel({
  id: 'quickgen-blocks',
  title: 'QuickGen Blocks',
  component: QuickGenBlocksPanel,
  category: 'generation',
  tags: ['generation', 'prompt', 'blocks', 'quickgen', 'control-center'],
  icon: 'grid',
  description: 'Prompt companion blocks for quick generation',
  availableIn: ['control-center'],
  settingScopes: ['generation'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
