import { GameWorldEditorTabStub } from '@/components/game/GameWorldEditorTabStub';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → World Tools → Interaction Presets tab.
 *
 * Registered to drive GameWorld's registry-derived nav. GameWorld renders the
 * real InteractionPresetEditor from its own switch; see GameWorldEditorTabStub.
 */
export default definePanel({
  id: 'game-world-presets',
  title: 'Interaction Presets',
  component: GameWorldEditorTabStub,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 10,
  description: 'Manage reusable interaction presets at world scope.',
});
