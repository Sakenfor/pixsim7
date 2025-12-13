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

export { DebugSettings } from './components/modules/DebugSettings';
export { GeneralSettings } from './components/modules/GeneralSettings';
export { GenerationSettings } from './components/modules/GenerationSettings';
export { MediaSettings } from './components/modules/MediaSettings';
export { PanelsSettings } from './components/modules/PanelsSettings';
export { ProfilesSettings } from './components/modules/ProfilesSettings';
export { PromptsSettings } from './components/modules/PromptsSettings';
export { UISettings } from './components/modules/UISettings';

// ============================================================================
// Components - Shared
// ============================================================================

export { DynamicSettingsPanel } from './components/shared/DynamicSettingsPanel';
export { SettingFieldRenderer } from './components/shared/SettingFieldRenderer';

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

export { registerGenerationSettings } from './lib/schemas/generation.settings';
export { registerMediaSettings } from './lib/schemas/media.settings';
export { registerPromptSettings } from './lib/schemas/prompts.settings';
export { registerUISettings } from './lib/schemas/ui.settings';
