/**
 * Per-panel skin selection store.
 *
 * Maps a panelId → its chosen skin (+ terminal variant + CRT effect toggles).
 * Persisted; key owned in the stores registry (see `panelSkins.registrations`).
 * Skins are opt-in per panel (locked decision) — a panel must consume tokens
 * and self-apply via `usePanelSkin` for a selection to have any effect.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultVariantOf, getSkin, type SkinId } from './registry';

export const PANEL_SKIN_STORE_KEY = 'appearance:panel-skins:v1';

export interface PanelSkinSelection {
  skinId: SkinId;
  /** Terminal phosphor variant (ignored by skins without variants). */
  variant?: string;
  scanline?: boolean;
  glow?: boolean;
}

interface PanelSkinState {
  skins: Record<string, PanelSkinSelection>;
  setPanelSkin: (panelId: string, patch: Partial<PanelSkinSelection>) => void;
  resetPanelSkin: (panelId: string) => void;
}

export const usePanelSkinStore = create<PanelSkinState>()(
  persist(
    (set) => ({
      skins: {},
      setPanelSkin: (panelId, patch) =>
        set((s) => {
          const prev = s.skins[panelId] ?? { skinId: 'default' as SkinId };
          const next: PanelSkinSelection = { ...prev, ...patch };
          // Keep `variant` consistent with the chosen skin: default to the
          // skin's first variant when it has variants and none is valid;
          // clear it for skins without variants.
          const skin = getSkin(next.skinId);
          const variantIds = skin.variants ? Object.keys(skin.variants) : [];
          if (variantIds.length) {
            if (!next.variant || !variantIds.includes(next.variant)) {
              next.variant = defaultVariantOf(skin);
            }
          } else {
            next.variant = undefined;
          }
          return { skins: { ...s.skins, [panelId]: next } };
        }),
      resetPanelSkin: (panelId) =>
        set((s) => {
          const rest = { ...s.skins };
          delete rest[panelId];
          return { skins: rest };
        }),
    }),
    { name: PANEL_SKIN_STORE_KEY },
  ),
);

/**
 * Stable default selection. MUST be a shared reference: `selectPanelSkin` is
 * read through `useSyncExternalStore` (Zustand) with `Object.is` equality, so
 * returning a fresh `{ skinId: 'default' }` literal per call makes every
 * snapshot unequal → infinite re-render ("Maximum update depth exceeded").
 */
const DEFAULT_PANEL_SKIN: PanelSkinSelection = { skinId: 'default' };

/** Read a panel's selection (defaults to the no-op `default` skin). */
export function selectPanelSkin(
  state: PanelSkinState,
  panelId: string,
): PanelSkinSelection {
  return state.skins[panelId] ?? DEFAULT_PANEL_SKIN;
}
