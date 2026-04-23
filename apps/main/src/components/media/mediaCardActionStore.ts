/**
 * Active media card + per-card generation handler bundles.
 *
 * Thin wrapper around the generic `createActiveTargetStore` factory so
 * future "active X card" hotkey groups can share the same primitive.
 */
import { createActiveTargetStore } from '@lib/capabilities/activeTargetActions';

import type { ArtificialExtendOptions } from './useGenerationCardHandlers';

export interface MediaCardHandlerBundle {
  handleQuickGenerate?: () => void | Promise<void>;
  handleExtendWithSamePrompt?: () => void | Promise<void>;
  handleExtendWithActivePrompt?: () => void | Promise<void>;
  handleArtificialExtend?: (options?: ArtificialExtendOptions) => void | Promise<void>;
  handleRegenerate?: () => void | Promise<void>;
  handleGenerateStyleVariations?: () => void | Promise<void>;
  handleInsertPromptOnly?: () => void | Promise<void>;
}

export const mediaCardActionTarget = createActiveTargetStore<MediaCardHandlerBundle>();

/** Zustand hook — kept at original name for existing subscribers. */
export const useMediaCardActionStore = mediaCardActionTarget.useStore;

/** Convenience: handler bundle of the currently-active card, or undefined. */
export function getActiveMediaCardHandlers(): MediaCardHandlerBundle | undefined {
  return mediaCardActionTarget.getActiveBundle();
}
