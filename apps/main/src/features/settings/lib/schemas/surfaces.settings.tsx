/**
 * Surfaces Settings Schema
 *
 * Per-panel skin selection (plan `panel-skin-theming`). Registered as a tab
 * under the Appearance category, alongside Theme. The settings registry
 * stamps this tab's own `useStore`, so it uses the panel-skin adapter even
 * though Theme owns the category's default adapter.
 *
 * Scoped settings for the AI Assistant skin source. Prompt box/composer skins
 * are chosen separately from the right-click Skin menu.
 */

import {
  usePanelSkinStore,
  selectPanelSkin,
  listSkins,
  getSkin,
  SKINS,
  useAssistantTintStore,
  ASSISTANT_TINT_WINDOW_OPTIONS,
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

const TINT_WINDOW_OPTIONS = ASSISTANT_TINT_WINDOW_OPTIONS.map((o) => ({
  value: String(o.value),
  label: o.label,
}));

function useSurfacesSettingsAdapter(): SettingStoreAdapter {
  const selection = usePanelSkinStore((s) => selectPanelSkin(s, PANEL_ID));
  const setPanelSkin = usePanelSkinStore((s) => s.setPanelSkin);
  const tintWindowMs = useAssistantTintStore((s) => s.windowMs);
  const setTintWindowMs = useAssistantTintStore((s) => s.setWindowMs);

  return {
    get: (fieldId: string) => {
      switch (fieldId) {
        case 'skinId': return selection.skinId;
        case 'variant': return selection.variant ?? 'green';
        case 'scanline': return !!selection.scanline;
        case 'glow': return !!selection.glow;
        case 'activeTintWindow': return String(tintWindowMs);
        default: return undefined;
      }
    },
    set: (fieldId: string, value: any) => {
      switch (fieldId) {
        case 'skinId': setPanelSkin(PANEL_ID, { skinId: value as SkinId }); break;
        case 'variant': setPanelSkin(PANEL_ID, { variant: String(value || 'green') }); break;
        case 'scanline': setPanelSkin(PANEL_ID, { scanline: !!value }); break;
        case 'glow': setPanelSkin(PANEL_ID, { glow: !!value }); break;
        case 'activeTintWindow': setTintWindowMs(Number(value) || 0); break;
      }
    },
    getAll: () => ({
      skinId: selection.skinId,
      variant: selection.variant ?? 'green',
      scanline: !!selection.scanline,
      glow: !!selection.glow,
      activeTintWindow: String(tintWindowMs),
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
        'Give the AI Assistant panel its own look. Prompt box and composer surfaces use their own Skin menu entry when right-clicked.',
      fields: [
        {
          id: 'skinId',
          type: 'select',
          label: 'Skin',
          description: 'Default follows the global theme. Other skins recolor and re-font the AI Assistant panel.',
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
    {
      id: 'ai-assistant-reminders',
      title: 'Conversation reminders',
      description: 'Subtle cues that help you keep track of which chats are waiting on a reply.',
      fields: [
        {
          id: 'activeTintWindow',
          type: 'select',
          label: 'Active conversation tint',
          description:
            "After an agent replies, its tab keeps a soft tint that fades over this window — so chats where it's your turn stay easy to spot. Set to Off to disable.",
          defaultValue: String(10 * 60 * 1000),
          options: TINT_WINDOW_OPTIONS,
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
