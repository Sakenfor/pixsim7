import { GameWorldEditorTabStub } from '@/components/game/GameWorldEditorTabStub';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → World Tools → Validation tab.
 *
 * Registered to drive GameWorld's registry-derived nav. GameWorld renders the
 * real WorldValidationPanel from its own switch; see GameWorldEditorTabStub.
 */
export default definePanel({
  id: 'game-world-validation',
  title: 'Validation',
  component: GameWorldEditorTabStub,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 30,
  description: 'Check world health: behavior config validation and link integrity.',
});
