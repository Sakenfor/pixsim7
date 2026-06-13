import { GameWorldEditorTabStub } from '@/components/game/GameWorldEditorTabStub';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → Location Tools → Room Nav tab.
 *
 * Registered to drive GameWorld's registry-derived nav. GameWorld renders the
 * real RoomNavigationEditor from its own switch; see GameWorldEditorTabStub.
 */
export default definePanel({
  id: 'game-world-room-nav',
  title: 'Room Nav (Beta)',
  component: GameWorldEditorTabStub,
  category: 'game',
  contextLabel: 'location',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 30,
  description: 'Define local room movement links and routing behavior.',
});
