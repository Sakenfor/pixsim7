/**
 * Unseen Probes Store
 *
 * Tracks how many probe-tagged assets have arrived since the user last
 * focused the Probes panel, so the QuickGen "Open Probes" button can show
 * an at-a-glance count badge.
 *
 * Tracking strategy: simple counter incremented on `assetEvents.subscribe`
 * (i.e. on backend ASSET_CREATED websocket events) when the asset's
 * `asset_kind` is `probe`. Counter resets on panel mount AND on every
 * probe arrival while the panel is mounted, so the badge sits at 0 while
 * you're actively looking at probes.
 *
 * `lastOpenedAt` is persisted so a future "since last focus" derivation
 * (e.g. server-side count for the badge across sessions) has a timestamp
 * to compare against; the in-memory counter itself is not persisted —
 * deliberate, so a fresh window starts at 0.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { createBackendStorage, manuallyRehydrateStore } from '@lib/utils';

// Deep-import the event bus from its leaf module, not the barrel: the
// `ensureSubscribed()` registration below touches `assetEvents` at the bus
// level, and entering this graph from a non-app root (e.g. a unit test) can
// leave the heavy `@features/assets` barrel mid-initialization, resolving
// `assetEvents` to undefined. The leaf module has no cycle back into generation.
import { assetEvents } from '@features/assets/lib/assetEvents';

interface UnseenProbesState {
  unseen: number;
  lastOpenedAt: string | null;
}

interface UnseenProbesActions {
  /** Called when the Probes panel mounts OR the user clicks the open-probes
   *  button. Resets the counter and stamps the timestamp. */
  markOpened: () => void;
  /** Internal: tracks whether the Probes panel is currently mounted, so the
   *  websocket subscription can suppress increments while it's visible. */
  setPanelOpen: (open: boolean) => void;
}

export const useUnseenProbesStore = create<UnseenProbesState & UnseenProbesActions>()(
  persist(
    (set) => ({
      unseen: 0,
      lastOpenedAt: null,
      markOpened: () => set({ unseen: 0, lastOpenedAt: new Date().toISOString() }),
      setPanelOpen: (open) => {
        if (open) {
          panelOpenRef.value = true;
          set({ unseen: 0, lastOpenedAt: new Date().toISOString() });
        } else {
          panelOpenRef.value = false;
        }
      },
    }),
    {
      name: 'unseen_probes_v1',
      storage: createJSONStorage(() => createBackendStorage('unseenProbes')),
      version: 1,
      // unseen counter is intentionally per-window — only the timestamp persists.
      partialize: (state) => ({ lastOpenedAt: state.lastOpenedAt }),
    },
  ),
);

// Module-scoped flag so the websocket subscription can cheap-check whether
// the panel is currently visible without round-tripping through the store.
const panelOpenRef = { value: false };

let subscribed = false;
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  assetEvents.subscribe((asset) => {
    const kind = (asset as unknown as { asset_kind?: string }).asset_kind ?? 'content';
    if (kind !== 'probe') return;
    // Suppress count growth while the user is actively looking at probes.
    if (panelOpenRef.value) return;
    useUnseenProbesStore.setState((s) => ({ unseen: s.unseen + 1 }));
  });
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    manuallyRehydrateStore(
      useUnseenProbesStore,
      'unseenProbes_local',
      'UnseenProbesStore',
    );
    ensureSubscribed();
  }, 50);
}
