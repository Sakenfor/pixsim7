import { definePanel } from '../../../lib/definePanel';

import { RoomNavTab } from './RoomNavTab';

/**
 * Game World editor → Location Tools → Room Nav tab.
 *
 * Drives GameWorld's registry-derived nav and is mounted generically by
 * GameWorld. RoomNavTab reads the selected location from the
 * CAP_GAME_WORLD_EDITOR capability.
 */
export default definePanel({
  id: 'game-world-room-nav',
  title: 'Room Nav (Beta)',
  component: RoomNavTab,
  category: 'game',
  contextLabel: 'location',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 30,
  description: 'Define local room movement links and routing behavior.',
});
