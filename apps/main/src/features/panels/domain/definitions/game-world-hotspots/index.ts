import { GameWorldEditorTabStub } from '@/components/game/GameWorldEditorTabStub';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → Location Tools → Hotspots tab.
 *
 * Registered to drive GameWorld's registry-derived nav (label / description /
 * 'location' section via contextLabel). GameWorld renders the real
 * HotspotListEditor from its own switch; see GameWorldEditorTabStub.
 */
export default definePanel({
  id: 'game-world-hotspots',
  title: 'Hotspots',
  component: GameWorldEditorTabStub,
  category: 'game',
  contextLabel: 'location',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 10,
  description: 'Configure mesh hotspots and linked actions for this location.',
});
