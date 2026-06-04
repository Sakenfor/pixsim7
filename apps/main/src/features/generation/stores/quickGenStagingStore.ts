/**
 * Quick Gen staging store.
 *
 * Holds a single "load this asset's generation setup into Quick Gen" request
 * that was issued while no Quick Gen widget was mounted/open to receive it —
 * e.g. from the mobile gallery, where the Control Center (and thus its
 * QuickGenWidget) is not mounted at all.
 *
 * The request is drained by the next QuickGenWidget to become open (see
 * QuickGenWidget's drain effect), which hydrates its own scoped stores from
 * the staged asset. This makes "Load to Quick Gen" work even when Quick Gen
 * is not actively open, without forcing a particular surface to open.
 *
 * Intentionally NOT persisted — a staged load is a transient, this-session
 * intent; surviving a reload would surprise the user.
 */
import { create } from 'zustand';

import type { AssetModel } from '@features/assets';

export interface QuickGenStagedLoad {
  /** Asset whose source generation setup should be restored into Quick Gen. */
  asset: AssetModel;
  /** Strip the seed from the restored params (parity with the live action). */
  withoutSeed: boolean;
}

interface QuickGenStagingState {
  pending: QuickGenStagedLoad | null;
  /** Queue a load request, replacing any prior un-drained one. */
  stage: (request: QuickGenStagedLoad) => void;
  /** Atomically take and clear the pending request (null if none). */
  consume: () => QuickGenStagedLoad | null;
  /** Drop any pending request without consuming it. */
  clear: () => void;
}

export const useQuickGenStagingStore = create<QuickGenStagingState>((set, get) => ({
  pending: null,
  stage: (request) => set({ pending: request }),
  consume: () => {
    const { pending } = get();
    if (pending) set({ pending: null });
    return pending;
  },
  clear: () => set({ pending: null }),
}));
