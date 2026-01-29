/**
 * Widget Settings Schema (Auto-Generated)
 *
 * Automatically generates settings tabs from widgets that have settingsSchema defined.
 * No manual configuration needed - just add settingsSchema to a widget definition.
 */

import {
  useOverlayWidgetSettingsStore,
  widgetRegistry,
  type WidgetDefinition,
  type WidgetSettingsGroup,
  type WidgetSettingField,
} from '@lib/widgets';

import { settingsSchemaRegistry, type SettingTab, type SettingGroup, type SettingField, type SettingStoreAdapter } from '../core';

// =============================================================================
// Schema Conversion
// =============================================================================

/**
 * Convert a WidgetSettingField to a SettingField for the settings system.
 */
function convertField(widgetId: string, field: WidgetSettingField): SettingField {
  const baseField = {
    id: `${widgetId}.${field.key}`,
    label: field.label,
    description: field.description,
  };

  switch (field.type) {
    case 'toggle':
      return { ...baseField, type: 'toggle' as const };
    case 'select':
      return { ...baseField, type: 'select' as const, options: field.options };
    case 'number':
      return { ...baseField, type: 'number' as const, min: field.min, max: field.max, step: field.step };
    case 'text':
      return { ...baseField, type: 'text' as const, placeholder: field.placeholder, maxLength: field.maxLength };
    case 'range':
      return { ...baseField, type: 'range' as const, min: field.min, max: field.max, step: field.step, format: field.format };
    default:
      return { ...baseField, type: 'text' as const };
  }
}

/**
 * Convert a WidgetSettingsGroup to a SettingGroup for the settings system.
 */
function convertGroup(widgetId: string, group: WidgetSettingsGroup): SettingGroup {
  return {
    id: group.id,
    title: group.title,
    description: group.description,
    fields: group.fields.map(field => convertField(widgetId, field)),
  };
}

/**
 * Convert a widget's settingsSchema to a SettingTab for the settings system.
 */
function widgetToSettingTab(widget: WidgetDefinition): SettingTab {
  const schema = widget.settingsSchema!;
  return {
    id: widget.id,
    label: widget.title,
    icon: widget.icon,
    groups: schema.groups.map(group => convertGroup(widget.id, group)),
  };
}

// =============================================================================
// Store Adapter
// =============================================================================

/**
 * Parse a field ID like "video-scrub.showTimeline" into widget ID and setting key.
 */
function parseFieldId(fieldId: string): { widgetId: string; settingKey: string } {
  const dotIndex = fieldId.indexOf('.');
  if (dotIndex === -1) {
    return { widgetId: fieldId, settingKey: '' };
  }
  return {
    widgetId: fieldId.slice(0, dotIndex),
    settingKey: fieldId.slice(dotIndex + 1),
  };
}

/**
 * Store adapter that connects settings schema to overlayWidgetSettingsStore.
 */
function useWidgetSettingsStoreAdapter(): SettingStoreAdapter {
  const store = useOverlayWidgetSettingsStore();

  return {
    get: (fieldId: string) => {
      const { widgetId, settingKey } = parseFieldId(fieldId);
      if (!settingKey) return undefined;
      const settings = store.getSettings(widgetId);
      return settings[settingKey];
    },

    set: (fieldId: string, value: unknown) => {
      const { widgetId, settingKey } = parseFieldId(fieldId);
      if (!settingKey) return;
      store.updateSettings(widgetId, { [settingKey]: value });
    },

    getAll: () => {
      // Get all widgets with settings schemas
      const widgetsWithSettings = widgetRegistry.getAll().filter(w => w.settingsSchema);
      const all: Record<string, unknown> = {};

      for (const widget of widgetsWithSettings) {
        const settings = store.getSettings(widget.id);
        for (const [key, value] of Object.entries(settings)) {
          all[`${widget.id}.${key}`] = value;
        }
      }

      return all;
    },
  };
}

// =============================================================================
// Registration
// =============================================================================

/**
 * Register widget settings from all widgets that have settingsSchema defined.
 * Called once during app initialization.
 */
export function registerWidgetSettings(): () => void {
  const unregisterFns: Array<() => void> = [];

  // Get all widgets with settings schemas
  const widgetsWithSettings = widgetRegistry.getAll().filter(w => w.settingsSchema);

  if (widgetsWithSettings.length === 0) {
    // No widgets with settings - register empty category
    return () => {};
  }

  // Register category with first widget
  const firstWidget = widgetsWithSettings[0];
  const firstTab = widgetToSettingTab(firstWidget);

  const unregister1 = settingsSchemaRegistry.register({
    categoryId: 'widgets',
    category: {
      label: 'Widgets',
      icon: '🧩',
      order: 25, // After UI, before Library
    },
    tab: firstTab,
    useStore: useWidgetSettingsStoreAdapter,
  });
  unregisterFns.push(unregister1);

  // Register remaining widgets as additional tabs
  for (let i = 1; i < widgetsWithSettings.length; i++) {
    const widget = widgetsWithSettings[i];
    const tab = widgetToSettingTab(widget);

    const unregister = settingsSchemaRegistry.register({
      categoryId: 'widgets',
      tab,
      useStore: useWidgetSettingsStoreAdapter,
    });
    unregisterFns.push(unregister);
  }

  return () => {
    unregisterFns.forEach(fn => fn());
  };
}

/**
 * Get all widgets that have settings schemas defined.
 * Useful for dynamically generating settings UI.
 */
export function getWidgetsWithSettings(): WidgetDefinition[] {
  return widgetRegistry.getAll().filter(w => w.settingsSchema);
}
