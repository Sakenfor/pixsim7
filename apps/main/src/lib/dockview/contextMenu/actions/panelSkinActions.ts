/**
 * Panel "Skin" context-menu submenu.
 *
 * Right-click a panel tab / content → Skin → pick a skin (skins with variants
 * open a sub-submenu), plus CRT scanline / glow toggles for skins that support
 * them. Reads & writes the same `panelSkinStore` as Settings → Appearance →
 * Surfaces, so both stay in sync. Enumerated from the skin registry, so new
 * skins appear here automatically. Shown only for panels registered as
 * skinnable (see `skinnablePanels`). Plan `panel-skin-theming`.
 *
 * Context-menu actions run outside React — use store `.getState()`, not hooks.
 */

import {
  defaultVariantOf,
  getSkin,
  isSkinnablePanel,
  listSkins,
  selectPanelSkin,
  usePanelSkinStore,
  type PanelSkinSelection,
} from '@features/appearance';

import type { MenuAction, MenuActionContext } from '../types';

const AVAILABLE: Array<'tab' | 'panel-content' | 'prompt-text'> = ['tab', 'panel-content', 'prompt-text'];

function skinPanelId(ctx: MenuActionContext): string {
  const dataSkinPanelId = ctx.data?.skinPanelId;
  return typeof dataSkinPanelId === 'string' && dataSkinPanelId.length > 0
    ? dataSkinPanelId
    : ctx.panelId ?? '';
}

function currentSelection(ctx: MenuActionContext) {
  return selectPanelSkin(usePanelSkinStore.getState(), skinPanelId(ctx));
}

function setSkin(panelId: string, patch: Partial<PanelSkinSelection>) {
  usePanelSkinStore.getState().setPanelSkin(panelId, patch);
}

export const panelSkinAction: MenuAction = {
  id: 'panel:skin',
  label: 'Skin',
  icon: 'terminal',
  category: 'panel',
  hideWhenEmpty: true,
  availableIn: AVAILABLE,
  visible: (ctx) => isSkinnablePanel(skinPanelId(ctx)),
  children: (ctx) => {
    const panelId = skinPanelId(ctx);
    if (!panelId) return [];
    const sel = currentSelection(ctx);
    const items: MenuAction[] = [];

    for (const skin of listSkins()) {
      const active = sel.skinId === skin.id;
      const variantIds = skin.variants ? Object.keys(skin.variants) : [];

      if (variantIds.length) {
        // Skin with variants → submenu. Picking a variant also selects the skin.
        items.push({
          id: `panel:skin:${skin.id}`,
          label: skin.label,
          icon: active ? 'check' : undefined,
          availableIn: AVAILABLE,
          children: () =>
            Object.entries(skin.variants ?? {}).map(([vid, v]) => ({
              id: `panel:skin:${skin.id}:${vid}`,
              label: v.label,
              icon: active && (sel.variant ?? defaultVariantOf(skin)) === vid ? 'check' : undefined,
              availableIn: AVAILABLE,
              execute: () => setSkin(panelId, { skinId: skin.id, variant: vid }),
            })),
          execute: () => setSkin(panelId, { skinId: skin.id }),
        });
      } else {
        items.push({
          id: `panel:skin:${skin.id}`,
          label: skin.label,
          icon: active ? 'check' : undefined,
          availableIn: AVAILABLE,
          execute: () => setSkin(panelId, { skinId: skin.id }),
        });
      }
    }

    // Effect toggles — only for the currently-selected skin if it supports them.
    if (getSkin(sel.skinId).supportsEffects) {
      items.push({
        id: 'panel:skin:scanline',
        label: 'CRT scanlines',
        icon: sel.scanline ? 'check' : undefined,
        availableIn: AVAILABLE,
        divider: true,
        sectionLabel: 'Effects',
        execute: () => setSkin(panelId, { scanline: !sel.scanline }),
      });
      items.push({
        id: 'panel:skin:glow',
        label: 'Glow',
        icon: sel.glow ? 'check' : undefined,
        availableIn: AVAILABLE,
        execute: () => setSkin(panelId, { glow: !sel.glow }),
      });
    }

    return items;
  },
  execute: () => {},
};

export const panelSkinActions = [panelSkinAction];
