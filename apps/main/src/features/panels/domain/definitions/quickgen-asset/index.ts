import { AssetPanel as QuickGenAssetPanel } from '@features/generation/components/QuickGeneratePanels';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'quickgen-asset',
  title: 'QuickGen Asset',
  component: QuickGenAssetPanel,
  category: 'generation',
  tags: ['generation', 'queue', 'asset', 'quickgen', 'control-center'],
  icon: 'image',
  description: 'Asset input panel for quick generation workflows',
  availableIn: ['control-center'],
  settingScopes: ['generation'],
  supportsCompactMode: true,
  supportsMultipleInstances: false,
});
