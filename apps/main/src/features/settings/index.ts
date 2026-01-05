/**
 * Settings Feature
 *
 * Settings management, configuration panels, schemas, and registries.
 */

// ============================================================================
// Components - Main Panels
// ============================================================================

export { SettingsPanel } from './components/SettingsPanel';
export { MediaCardConfigPage } from './components/MediaCardConfigPage';
export { PanelConfigurationPanel } from './components/PanelConfigurationPanel';
export { WorkspaceProfileManager } from './components/WorkspaceProfileManager';

// ============================================================================
// Components - Settings Modules
// ============================================================================

export { LibrarySettings } from './components/modules/LibrarySettings';
export { DebugSettings } from './components/modules/DebugSettings';
export { GeneralSettings } from './components/modules/GeneralSettings';
export { GenerationSettings } from './components/modules/GenerationSettings';
export { PanelsSettings } from './components/modules/PanelsSettings';
export { ProfilesSettings } from './components/modules/ProfilesSettings';
export { PromptsSettings } from './components/modules/PromptsSettings';
// Note: UISettings is no longer exported - UI settings are now integrated into individual panels
// Note: AssetsSettings, MediaSettings, GallerySettings removed - now unified in LibrarySettings

// ============================================================================
// Components - Shared
// ============================================================================

export { DynamicSettingsPanel } from './components/shared/DynamicSettingsPanel';
export { SettingFieldRenderer } from './components/shared/SettingFieldRenderer';
export { createPanelSchemaSettingsSection } from './components/shared/panelSchemaSettings';

// ============================================================================
// Lib - Core Settings System
// ============================================================================

export * from './lib/core';

// Re-export key registries for convenience
export { settingsRegistry } from './lib/core/registry';
export { settingsSchemaRegistry } from './lib/core/settingsSchemaRegistry';

// ============================================================================
// Lib - Settings Schemas
// ============================================================================

export { registerLibrarySettings } from './lib/schemas/library.settings';
export { registerGenerationSettings } from './lib/schemas/generation.settings';
export { registerPromptSettings } from './lib/schemas/prompts.settings';
export { registerPanelSettings } from './lib/schemas/panel.settings';
// Note: registerAssetSettings, registerMediaSettings, registerGallerySettings removed - now unified in registerLibrarySettings

// ============================================================================
// Stores - UI State
// ============================================================================

export {
  usePanelInteractionSettingsStore,
  usePanelSettings,
  useInteractionOverride,
  type PanelInteractionSettingsState,
  type PanelInteractionSettings,
  type PanelInteractionOverride,
} from './stores/panelInteractionSettingsStore';
export { usePanelSettingsUiStore } from './stores/panelSettingsUiStore';
export { useSettingsUiStore } from './stores/settingsUiStore';
