/**
 * Schema Utilities
 *
 * Shared helper functions for working with settings schemas.
 */

import type { SettingField, SettingGroup, SettingTab } from './types';

/**
 * Collect all fields from schema tabs and groups.
 */
export function collectSchemaFields(
  tabs?: SettingTab[],
  groups?: SettingGroup[],
): SettingField[] {
  const fields: SettingField[] = [];
  groups?.forEach((group) => {
    fields.push(...group.fields);
  });
  tabs?.forEach((tab) => {
    tab.groups.forEach((group) => {
      fields.push(...group.fields);
    });
  });
  return fields;
}

/**
 * Collect all field default values from schema tabs and groups.
 * Returns a record of fieldId -> defaultValue.
 */
export function collectSchemaDefaults(
  tabs?: SettingTab[],
  groups?: SettingGroup[],
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  const processField = (field: SettingField) => {
    if ('defaultValue' in field && field.defaultValue !== undefined) {
      defaults[field.id] = field.defaultValue;
    }
  };

  groups?.forEach((group) => {
    group.fields.forEach(processField);
  });

  tabs?.forEach((tab) => {
    tab.groups.forEach((group) => {
      group.fields.forEach(processField);
    });
  });

  return defaults;
}

/**
 * Resolve schema values by merging provided settings with schema defaults.
 * Settings values take precedence over defaults.
 */
export function resolveSchemaValues<T extends Record<string, unknown> = Record<string, unknown>>(
  settings: T,
  tabs?: SettingTab[],
  groups?: SettingGroup[],
): T {
  const defaults = collectSchemaDefaults(tabs, groups);
  return { ...defaults, ...settings } as T;
}
