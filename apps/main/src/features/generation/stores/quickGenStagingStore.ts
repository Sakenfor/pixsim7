/**
 * Quick Gen staging store.
 *
 * Holds "do this in Quick Gen" intents issued while no Quick Gen widget was
 * mounted/open to receive them — e.g. from the mobile gallery, where the
 * Control Center (and thus its QuickGenWidget) is not mounted at all.
 *
 * The queue is drained by the next QuickGenWidget to become open (see
 * QuickGenWidget's drain effect), which dispatches each intent against its own
 * scoped stores via `runQuickGenIntent`. This makes the card's generation
 * actions — "Load to Quick Gen", insert prompt/seed/assets, patch — work even
 * when Quick Gen isn't open, without forcing a particular surface to mount.
 *
 * Intentionally NOT persisted — a staged intent is a transient, this-session
 * intent; surviving a reload would surprise the user.
 */
import { create } from 'zustand';

import type { AssetModel } from '@features/assets';

import type { OperationType } from '@/types/operations';

/** Which card action a staged intent reproduces once a widget opens. */
export type QuickGenIntentKind =
  | 'load'
  | 'patch'
  | 'insert-prompt'
  | 'insert-seed'
  | 'insert-assets';

export interface QuickGenIntent {
  kind: QuickGenIntentKind;
  /** Asset whose generation context the intent draws from. */
  asset: AssetModel;
  /**
   * Operation type to fall back to when the asset's context omits one — the
   * card's operation, captured at stage time (the live widget's current op is
   * not available from a surface with no widget).
   */
  fallbackOperationType: OperationType;
  /** Strip the seed from restored params (only meaningful for 'load'). */
  withoutSeed?: boolean;
}

interface QuickGenStagingState {
  pending: QuickGenIntent[];
  /** Queue an intent for the next widget to drain. */
  stage: (intent: QuickGenIntent) => void;
  /** Atomically take and clear all pending intents (empty array if none). */
  consume: () => QuickGenIntent[];
  /** Drop any pending intents without running them. */
  clear: () => void;
}

export const useQuickGenStagingStore = create<QuickGenStagingState>((set, get) => ({
  pending: [],
  stage: (intent) => set((s) => ({ pending: [...s.pending, intent] })),
  consume: () => {
    const { pending } = get();
    if (pending.length) set({ pending: [] });
    return pending;
  },
  clear: () => set({ pending: [] }),
}));
