export { useAppearanceStore } from './stores/appearanceStore';
export type { ColorScheme, AccentColor, IconTheme, ButtonStyle } from './stores/appearanceStore';
export { useApplyAppearance } from './useApplyAppearance';
export { useAccentButtonClasses } from './useAccentButtonClasses';
export type { AccentButtonClasses } from './useAccentButtonClasses';
export {
  usePanelSkin,
  usePanelSkinStore,
  selectPanelSkin,
  listSkins,
  getSkin,
  defaultVariantOf,
  SKINS,
  DEFAULT_TERMINAL_VARIANT,
  ensureSkinStyles,
  registerSkinnablePanel,
  isSkinnablePanel,
  listSkinnablePanels,
} from './skins';
export type {
  PanelSkin,
  SkinId,
  PanelSkinSelection,
  ResolvedPanelSkin,
} from './skins';
