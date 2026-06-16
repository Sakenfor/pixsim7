import { definePanel } from '../../../lib/definePanel';

import { LayoutTab } from './LayoutTab';

/**
 * Game World editor → Location Tools → 2D Layout tab.
 *
 * Drives GameWorld's registry-derived nav and is mounted generically by
 * GameWorld. LayoutTab reads the selected location from the
 * CAP_GAME_WORLD_EDITOR capability.
 */
export default definePanel({
  id: 'game-world-2d-layout',
  title: '2D Layout',
  component: LayoutTab,
  category: 'game',
  contextLabel: 'location',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 20,
  description: 'Manage 2D slot layout and world-linked actor placement.',
});
