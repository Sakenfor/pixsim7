import { definePanel } from '../../../lib/definePanel';

import { ProbesPanel } from './ProbesPanel';

export default definePanel({
  id: 'probes',
  title: 'Probes',
  component: ProbesPanel,
  category: 'generation',
  tags: ['gallery', 'assets', 'probes', 'asset-gallery'],
  icon: 'flask',
  description: 'Throwaway probe-style generations (asset_kind=probe). Filled by Probe-mode runs from QuickGen.',
  supportsCompactMode: true,
  supportsMultipleInstances: false,
  siblings: ['gallery', 'mini-gallery', 'recent-generations'],
  internal: false,
});
