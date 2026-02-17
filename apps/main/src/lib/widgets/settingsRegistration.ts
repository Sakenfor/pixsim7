import type {
  SettingField,
  SettingGroup,
  SettingTab,
  SettingStoreAdapter,
} from '@lib/settingsSchema';

import {
  useOverlayWidgetSettingsStore,
  CONFIGURABLE_WIDGET_IDS,
  WIDGET_LABELS,
  type ConfigurableWidgetId,
  type OverlayContextId,
  type WidgetVisibilityMode,
} from './overlayWidgetSettingsStore';
import type {
  WidgetDefinition,
  WidgetSettingsGroup,
  WidgetSettingField,
} from './types';
import { widgetRegistry } from './widgetRegistry';


// =============================================================================
// Schema Conversion (widget behavioral settings)
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
// Context Visibility Schema
// =============================================================================

const VISIBILITY_OPTIONS = [
  { value: 'always', label: 'Always visible' },
  { value: 'hover', label: 'Show on hover' },
  { value: 'hidden', label: 'Hidden' },
];

function buildVisibilityFields(contextId: OverlayContextId): SettingField[] {
  return CONFIGURABLE_WIDGET_IDS.map((widgetId) => ({
    id: `ctx:${contextId}__${widgetId}`,
    type: 'select' as const,
    label: WIDGET_LABELS[widgetId],
    options: VISIBILITY_OPTIONS,
    defaultValue: 'hover',
  }));
}

/** Settings tab for per-context widget visibility */
const contextVisibilityTab: SettingTab = {
  id: 'context-visibility',
  label: 'Context Visibility',
  icon: '🔲',
  groups: [
    {
      id: 'gallery-overlays',
      title: 'Gallery Cards',
      description: 'Widget visibility on full-size gallery cards.',
      fields: buildVisibilityFields('gallery'),
    },
    {
      id: 'compact-overlays',
      title: 'Compact Cards',
      description: 'Widget visibility on compact asset cards (generation panels, queues).',
      fields: buildVisibilityFields('compact'),
    },
    {
      id: 'viewer-overlays',
      title: 'Viewer',
      description: 'Widget visibility in the asset viewer.',
      fields: buildVisibilityFields('viewer'),
    },
  ],
};

// =============================================================================
// Store Adapter
// =============================================================================

/** Parse a compound context-visibility field ID like "ctx:gallery__favorite-toggle" */
function parseCtxFieldId(fieldId: string): { context: OverlayContextId; widgetId: ConfigurableWidgetId } | null {
  if (!fieldId.startsWith('ctx:')) return null;
  const rest = fieldId.slice(4); // strip "ctx:"
  const sep = rest.indexOf('__');
  if (sep < 0) return null;
  const context = rest.slice(0, sep) as OverlayContextId;
  const widgetId = rest.slice(sep + 2) as ConfigurableWidgetId;
  if (!['gallery', 'compact', 'viewer'].includes(context)) return null;
  if (!CONFIGURABLE_WIDGET_IDS.includes(widgetId)) return null;
  return { context, widgetId };
}

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
 * Handles both widget behavioral settings (dot-separated) and context visibility (ctx: prefix).
 */
function useWidgetSettingsStoreAdapter(): SettingStoreAdapter {
  const store = useOverlayWidgetSettingsStore();

  return {
    get: (fieldId: string) => {
      // Context visibility field?
      const ctxParsed = parseCtxFieldId(fieldId);
      if (ctxParsed) {
        return store.getContextVisibility(ctxParsed.context, ctxParsed.widgetId);
      }

      // Widget behavioral settings
      const { widgetId, settingKey } = parseFieldId(fieldId);
      if (!settingKey) return undefined;
      const settings = store.getSettings(widgetId);
      return settings[settingKey];
    },

    set: (fieldId: string, value: unknown) => {
      // Context visibility field?
      const ctxParsed = parseCtxFieldId(fieldId);
      if (ctxParsed) {
        store.setContextVisibility(ctxParsed.context, ctxParsed.widgetId, value as WidgetVisibilityMode);
        return;
      }

      // Widget behavioral settings
      const { widgetId, settingKey } = parseFieldId(fieldId);
      if (!settingKey) return;
      store.updateSettings(widgetId, { [settingKey]: value });
    },

    getAll: () => {
      const all: Record<string, unknown> = {};

      // Widget behavioral settings
      const widgetsWithSettings = getWidgetsWithSettings();
      for (const widget of widgetsWithSettings) {
        const settings = store.getSettings(widget.id);
        for (const [key, value] of Object.entries(settings)) {
          all[`${widget.id}.${key}`] = value;
        }
      }

      // Context visibility settings
      for (const context of ['gallery', 'compact', 'viewer'] as OverlayContextId[]) {
        for (const widgetId of CONFIGURABLE_WIDGET_IDS) {
          all[`ctx:${context}__${widgetId}`] = store.getContextVisibility(context, widgetId);
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
 * Includes both per-widget behavioral settings tabs and the context visibility tab.
 */
export function createWidgetSettingsRegistration(): WidgetSettingsRegistration | null {
  const widgetsWithSettings = getWidgetsWithSettings();

  // Always include the context visibility tab even if no widgets have behavioral settings
  const tabs = [
    ...widgetsWithSettings.map((widget) => widgetToSettingTab(widget)),
    contextVisibilityTab,
  ];

  if (tabs.length === 0) {
    return null;
  }

  return {
    tabs,
    useStore: useWidgetSettingsStoreAdapter,
  };
}

/**
 * Get all widgets that have settings schemas defined.
 */
export function getWidgetsWithSettings(): WidgetDefinition[] {
  return widgetRegistry.getAll().filter((w) => w.settingsSchema);
}
