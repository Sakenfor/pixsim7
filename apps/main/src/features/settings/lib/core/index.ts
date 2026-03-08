/**
 * Settings Core System
 *
 * Core types, registries, and schema management.
 */

export type * from './types';

export { settingsRegistry } from './registry';
export type { SettingsSubSection, SettingsModule } from './registry';

export { settingsSchemaRegistry } from './settingsSchemaRegistry';
export type {
  SettingCategory,
  SettingTab,
  SettingGroup,
  SettingStoreAdapter,
  SettingRegistration,
} from './settingsSchemaRegistry';

export { collectSchemaFields, collectSchemaDefaults, resolveSchemaValues } from './schemaUtils';
