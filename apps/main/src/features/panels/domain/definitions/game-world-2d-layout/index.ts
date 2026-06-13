import { GameWorldEditorTabStub } from '@/components/game/GameWorldEditorTabStub';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → Location Tools → 2D Layout tab.
 *
 * Registered to drive GameWorld's registry-derived nav. GameWorld renders the
 * real NpcSlotEditor from its own switch; see GameWorldEditorTabStub.
 */
export default definePanel({
  id: 'game-world-2d-layout',
  title: '2D Layout',
  component: GameWorldEditorTabStub,
  category: 'game',
  contextLabel: 'location',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 20,
  description: 'Manage 2D slot layout and world-linked actor placement.',
});
