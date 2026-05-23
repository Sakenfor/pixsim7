/**
 * Surfaces Settings Schema
 *
 * Per-panel skin selection (plan `panel-skin-theming`). Registered as a tab
 * under the Appearance category, alongside Theme. The settings registry
 * stamps this tab's own `useStore`, so it uses the panel-skin adapter even
 * though Theme owns the category's default adapter.
 *
 * Scoped to the AI Assistant panel for now (the first skinnable consumer);
 * generalizes to a per-panel picker once more panels opt in.
 */

import {
  usePanelSkinStore,
  selectPanelSkin,
  listSkins,
  getSkin,
  SKINS,
  type SkinId,
} from '@features/appearance';

import { settingsSchemaRegistry, type SettingTab } from '../core';
import type { SettingStoreAdapter } from '../core';

const PANEL_ID = 'ai-assistant';

const SKIN_OPTIONS = listSkins().map((s) => ({ value: s.id, label: s.label }));
// Variant options come from the only skin that currently has variants
// (terminal). When another skin gains variants this should become dynamic
// (a custom field that reads the selected skin); for now showWhen gates it to
// skins that actually have variants.
const VARIANT_OPTIONS = Object.entries(SKINS.terminal.variants ?? {}).map(
  ([value, v]) => ({ value, label: v.label }),
);

const skinHasVariants = (v: Record<string, any>) => {
  const skin = getSkin(v.skinId);
  return !!skin.variants && Object.keys(skin.variants).length > 0;
};
const skinSupportsEffects = (v: Record<string, any>) => !!getSkin(v.skinId).supportsEffects;

function useSurfacesSettingsAdapter(): SettingStoreAdapter {
  const selection = usePanelSkinStore((s) => selectPanelSkin(s, PANEL_ID));
  const setPanelSkin = usePanelSkinStore((s) => s.setPanelSkin);

  return {
    get: (fieldId: string) => {
      switch (fieldId) {
        case 'skinId': return selection.skinId;
        case 'variant': return selection.variant ?? 'green';
        case 'scanline': return !!selection.scanline;
        case 'glow': return !!selection.glow;
        default: return undefined;
      }
    },
    set: (fieldId: string, value: any) => {
      switch (fieldId) {
        case 'skinId': setPanelSkin(PANEL_ID, { skinId: value as SkinId }); break;
        case 'variant': setPanelSkin(PANEL_ID, { variant: String(value || 'green') }); break;
        case 'scanline': setPanelSkin(PANEL_ID, { scanline: !!value }); break;
        case 'glow': setPanelSkin(PANEL_ID, { glow: !!value }); break;
      }
    },
    getAll: () => ({
      skinId: selection.skinId,
      variant: selection.variant ?? 'green',
      scanline: !!selection.scanline,
      glow: !!selection.glow,
    }),
  };
}

const surfacesTab: SettingTab = {
  id: 'surfaces',
  label: 'Surfaces',
  icon: 'terminal',
  groups: [
    {
      id: 'ai-assistant-skin',
      title: 'AI Assistant panel',
      description:
        'Give the AI Assistant panel its own look. The skin layers on top of the global theme and only affects this panel.',
      fields: [
        {
          id: 'skinId',
          type: 'select',
          label: 'Skin',
          description: 'Default follows the global theme. Other skins recolor (and re-font) just this panel.',
          defaultValue: 'default',
          options: SKIN_OPTIONS,
        },
        {
          id: 'variant',
          type: 'select',
          label: 'Variant',
          description: 'Scheme-independent — the variant replaces light/dark for this skin.',
          defaultValue: 'green',
          showWhen: skinHasVariants,
          options: VARIANT_OPTIONS,
        },
        {
          id: 'scanline',
          type: 'toggle',
          label: 'CRT scanlines',
          description: 'Faint animated raster overlay (auto-disabled under reduced-motion).',
          defaultValue: false,
          showWhen: skinSupportsEffects,
        },
        {
          id: 'glow',
          type: 'toggle',
          label: 'Glow',
          description: 'Text bloom in the accent tone.',
          defaultValue: false,
          showWhen: skinSupportsEffects,
        },
      ],
    },
  ],
};

export function registerSurfacesSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'appearance',
    tab: surfacesTab,
    useStore: useSurfacesSettingsAdapter,
  });
}
