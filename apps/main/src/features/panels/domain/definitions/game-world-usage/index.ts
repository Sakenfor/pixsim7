import { GameWorldEditorTabStub } from '@/components/game/GameWorldEditorTabStub';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → World Tools → Usage Stats tab.
 *
 * Registered to drive GameWorld's registry-derived nav. GameWorld renders the
 * real InteractionPresetUsagePanel from its own switch; see
 * GameWorldEditorTabStub.
 */
export default definePanel({
  id: 'game-world-usage',
  title: 'Usage Stats',
  component: GameWorldEditorTabStub,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 20,
  description: 'Inspect development usage metrics for interaction presets.',
});
