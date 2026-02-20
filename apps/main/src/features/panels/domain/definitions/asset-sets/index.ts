import { definePanel } from '../../../lib/definePanel';
import { AssetSetsPanel } from './AssetSetsPanel';

export default definePanel({
  id: 'asset-sets',
  title: 'Asset Sets',
  component: AssetSetsPanel,
  category: 'tools',
  tags: ['assets', 'sets', 'collections', 'generation', 'strategy'],
  icon: 'layers',
  description:
    'Create and manage named asset collections (manual or smart/tag-based) for use with generation combination strategies.',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  orchestration: {
    defaultZone: 'left',
    allowedZones: ['left', 'right', 'bottom', 'floating'],
    closeOthersInZone: false,
    preferredWidth: 300,
  },
});
