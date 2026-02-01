import { widgetRegistry } from './widgetRegistry';
import { useOverlayWidgetSettingsStore } from './overlayWidgetSettingsStore';
import type {
  WidgetDefinition,
  WidgetSettingsGroup,
  WidgetSettingField,
} from './types';

import type {
  SettingField,
  SettingGroup,
  SettingTab,
  SettingStoreAdapter,
} from '@lib/settingsSchema';

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
      return {
        ...baseField,
        type: 'number' as const,
        min: field.min,
        max: field.max,
        step: field.step,
      };
    case 'text':
      return {
        ...baseField,
        type: 'text' as const,
        placeholder: field.placeholder,
        maxLength: field.maxLength,
      };
    case 'range':
      return {
        ...baseField,
        type: 'range' as const,
        min: field.min,
        max: field.max,
        step: field.step,
        format: field.format,
      };
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
    fields: group.fields.map((field) => convertField(widgetId, field)),
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
    groups: schema.groups.map((group) => convertGroup(widget.id, group)),
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
 * Store adapter that connects settings schema to overlay widget settings store.
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
      const widgetsWithSettings = getWidgetsWithSettings();
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
// Registration Factory
// =============================================================================

export interface WidgetSettingsRegistration {
  tabs: SettingTab[];
  useStore: () => SettingStoreAdapter;
}

/**
 * Create a settings registration payload for widgets.
 */
export function createWidgetSettingsRegistration(): WidgetSettingsRegistration | null {
  const widgetsWithSettings = getWidgetsWithSettings();
  if (widgetsWithSettings.length === 0) {
    return null;
  }

  return {
    tabs: widgetsWithSettings.map((widget) => widgetToSettingTab(widget)),
    useStore: useWidgetSettingsStoreAdapter,
  };
}

/**
 * Get all widgets that have settings schemas defined.
 */
export function getWidgetsWithSettings(): WidgetDefinition[] {
  return widgetRegistry.getAll().filter((w) => w.settingsSchema);
}
