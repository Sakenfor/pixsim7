/**
 * Media-card generation actions. Shortcuts are user-editable via the
 * settings UI. Each action is gated on an active card + the relevant
 * handler being published by that card.
 *
 * Wired through the generic `registerActiveTargetActions` factory so
 * future media-card-adjacent hotkey groups (prompt cards, block cards,
 * etc.) can plug in with the same primitive.
 */

import {
  registerActiveTargetActions,
  type ActiveTargetAction,
} from '@lib/capabilities/activeTargetActions';

import {
  mediaCardActionTarget,
  type MediaCardHandlerBundle,
} from './mediaCardActionStore';

const FEATURE_ID = 'media-card.generation';

const ACTIONS: ActiveTargetAction<MediaCardHandlerBundle>[] = [
  {
    id: 'media-card.gen.quick-generate',
    title: 'Quick generate',
    description: 'Run quick generate on the hovered card',
    shortcut: 'G',
    requires: 'handleQuickGenerate',
    execute: (b) => b.handleQuickGenerate?.(),
  },
  {
    id: 'media-card.gen.extend',
    title: 'Extend video',
    description: 'Native video extend on the hovered card (same prompt)',
    shortcut: 'E',
    requires: 'handleExtendWithSamePrompt',
    execute: (b) => b.handleExtendWithSamePrompt?.(),
  },
  {
    id: 'media-card.gen.extend-artificial-last',
    title: 'Artificial extend (last frame)',
    description: 'Extract last frame and run image-to-video on the hovered card',
    shortcut: 'Shift+E',
    requires: 'handleArtificialExtend',
    execute: (b) => b.handleArtificialExtend?.({ selector: { mode: 'last' } }),
  },
  {
    id: 'media-card.gen.regenerate',
    title: 'Regenerate',
    description: 'Re-run the same generation on the hovered card',
    shortcut: 'R',
    requires: 'handleRegenerate',
    execute: (b) => b.handleRegenerate?.(),
  },
  {
    id: 'media-card.gen.variations',
    title: 'Generate style variations',
    description: 'Generate style variations of the hovered card',
    shortcut: 'V',
    requires: 'handleGenerateStyleVariations',
    execute: (b) => b.handleGenerateStyleVariations?.(),
  },
  {
    id: 'media-card.gen.insert-prompt',
    title: 'Insert prompt',
    description: 'Insert the hovered card\u2019s prompt into the active widget',
    shortcut: 'P',
    requires: 'handleInsertPromptOnly',
    execute: (b) => b.handleInsertPromptOnly?.(),
  },
];

const handle = registerActiveTargetActions<MediaCardHandlerBundle>({
  featureId: FEATURE_ID,
  feature: {
    name: 'Media Card Generation',
    description: 'Hover-gated keyboard shortcuts for generation actions on the hovered media card.',
    icon: 'sparkles',
    category: 'utility',
  },
  store: mediaCardActionTarget,
  actions: ACTIONS,
});

export const registerMediaCardCapabilityActions = handle.register;
export const unregisterMediaCardCapabilityActions = handle.unregister;

/** Action ids (exported for GenerationButtonGroupContent to look up shortcuts). */
export const MEDIA_CARD_ACTION_IDS = {
  quickGenerate: 'media-card.gen.quick-generate',
  extend: 'media-card.gen.extend',
  extendArtificialLast: 'media-card.gen.extend-artificial-last',
  regenerate: 'media-card.gen.regenerate',
  variations: 'media-card.gen.variations',
  insertPrompt: 'media-card.gen.insert-prompt',
} as const;
