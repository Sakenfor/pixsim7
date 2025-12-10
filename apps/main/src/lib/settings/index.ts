/**
 * Settings System
 *
 * Schema-driven settings for modules to expose configurable options.
 */

export * from './types';
export * from './settingsSchemaRegistry';
export { SettingFieldRenderer } from './SettingFieldRenderer';
export { DynamicSettingsPanel } from './DynamicSettingsPanel';

// Schema registrations (can be imported to ensure settings are registered)
export { registerUISettings } from './ui.settings.js';
export { registerMediaSettings } from './media.settings';
export { registerPromptSettings } from './prompts.settings';
export { registerGenerationSettings } from './generation.settings';
