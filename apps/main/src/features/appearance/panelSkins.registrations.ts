/**
 * Appearance feature — panel-skin store registry declaration.
 *
 * Side-effect module imported eagerly at bootstrap so the stores registry
 * owns the persisted key before `pruneOrphans` runs. See `stores-registry-canon`.
 */

import { registerStore } from '@lib/stores';

import { ASSISTANT_TINT_STORE_KEY } from './assistantTintStore';
import { PANEL_SKIN_STORE_KEY } from './skins/panelSkinStore';
import { registerSkinnablePanel } from './skins/skinnablePanels';

registerStore({ id: 'appearance:panel-skins', key: PANEL_SKIN_STORE_KEY });
registerStore({ id: 'appearance:assistant-tint', key: ASSISTANT_TINT_STORE_KEY });

// Panels that consume tokens + self-apply via usePanelSkin. Surfaces that
// offer a skin choice (context menu, settings) gate on this set.
registerSkinnablePanel('ai-assistant');
registerSkinnablePanel('prompt-box');
