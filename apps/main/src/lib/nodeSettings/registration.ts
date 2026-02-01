import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { nodeTypeRegistry } from '@lib/registries';
import type {
  NodeTypeDefinition,
  NodeSettingsGroup,
  NodeSettingField,
} from '@pixsim7/shared.types';

import type {
  SettingField,
  SettingGroup,
  SettingTab,
  SettingStoreAdapter,
} from '@lib/settingsSchema';

// =============================================================================
// Node Settings Store
// =============================================================================

interface NodeSettingsState {
  /** Settings by node type ID */
  settings: Record<string, Record<string, unknown>>;

  /** Get settings for a node type */
  getSettings: (nodeTypeId: string) => Record<string, unknown>;

  /** Update settings for a node type */
  updateSettings: (nodeTypeId: string, updates: Record<string, unknown>) => void;

  /** Reset settings for a node type to defaults */
  resetSettings: (nodeTypeId: string) => void;

  /** Reset all node settings */
  resetAll: () => void;
}

/**
 * Get default settings for a node type.
 */
function getNodeTypeDefaults(nodeTypeId: string): Record<string, unknown> {
  const nodeType = nodeTypeRegistry.getSync(nodeTypeId);
  if (!nodeType?.settingsSchema?.defaults) {
    return {};
  }
  return { ...nodeType.settingsSchema.defaults };
}

/**
 * Zustand store for node type settings.
 */
export const useNodeSettingsStore = create<NodeSettingsState>()(
  persist(
    (set, get) => ({
      settings: {},

      getSettings: (nodeTypeId: string) => {
        const stored = get().settings[nodeTypeId] ?? {};
        const defaults = getNodeTypeDefaults(nodeTypeId);
        return { ...defaults, ...stored };
      },

      updateSettings: (nodeTypeId: string, updates: Record<string, unknown>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            [nodeTypeId]: {
              ...state.settings[nodeTypeId],
              ...updates,
            },
          },
        }));
      },

      resetSettings: (nodeTypeId: string) => {
        set((state) => {
          const next = { ...state.settings };
          delete next[nodeTypeId];
          return { settings: next };
        });
      },

      resetAll: () => {
        set({ settings: {} });
      },
    }),
    {
      name: 'pixsim7-node-settings',
      version: 1,
    }
  )
);

// =============================================================================
// Schema Conversion
// =============================================================================

/**
 * Convert a NodeSettingField to a SettingField for the settings system.
 */
function convertField(nodeTypeId: string, field: NodeSettingField): SettingField {
  const baseField = {
    id: `${nodeTypeId}.${field.key}`,
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
 * Convert a NodeSettingsGroup to a SettingGroup for the settings system.
 */
function convertGroup(nodeTypeId: string, group: NodeSettingsGroup): SettingGroup {
  return {
    id: group.id,
    title: group.title,
    description: group.description,
    fields: group.fields.map((field) => convertField(nodeTypeId, field)),
  };
}

/**
 * Convert a node type's settingsSchema to a SettingTab for the settings system.
 */
function nodeTypeToSettingTab(nodeType: NodeTypeDefinition): SettingTab {
  const schema = nodeType.settingsSchema!;
  return {
    id: nodeType.id,
    label: nodeType.name,
    icon: nodeType.icon,
    groups: schema.groups.map((group) => convertGroup(nodeType.id, group)),
  };
}

// =============================================================================
// Store Adapter
// =============================================================================

/**
 * Parse a field ID like "video.autoPlay" into node type ID and setting key.
 */
function parseFieldId(fieldId: string): { nodeTypeId: string; settingKey: string } {
  const dotIndex = fieldId.indexOf('.');
  if (dotIndex === -1) {
    return { nodeTypeId: fieldId, settingKey: '' };
  }
  return {
    nodeTypeId: fieldId.slice(0, dotIndex),
    settingKey: fieldId.slice(dotIndex + 1),
  };
}

/**
 * Store adapter that connects settings schema to node settings store.
 */
function useNodeSettingsStoreAdapter(): SettingStoreAdapter {
  const store = useNodeSettingsStore();

  return {
    get: (fieldId: string) => {
      const { nodeTypeId, settingKey } = parseFieldId(fieldId);
      if (!settingKey) return undefined;
      const settings = store.getSettings(nodeTypeId);
      return settings[settingKey];
    },

    set: (fieldId: string, value: unknown) => {
      const { nodeTypeId, settingKey } = parseFieldId(fieldId);
      if (!settingKey) return;
      store.updateSettings(nodeTypeId, { [settingKey]: value });
    },

    getAll: () => {
      const nodeTypesWithSettings = getNodeTypesWithSettings();
      const all: Record<string, unknown> = {};

      for (const nodeType of nodeTypesWithSettings) {
        const settings = store.getSettings(nodeType.id);
        for (const [key, value] of Object.entries(settings)) {
          all[`${nodeType.id}.${key}`] = value;
        }
      }

      return all;
    },
  };
}

// =============================================================================
// Registration Factory
// =============================================================================

export interface NodeSettingsRegistration {
  tabs: SettingTab[];
  useStore: () => SettingStoreAdapter;
}

/**
 * Create a settings registration payload for node types.
 */
export function createNodeSettingsRegistration(): NodeSettingsRegistration | null {
  const nodeTypesWithSettings = getNodeTypesWithSettings();
  if (nodeTypesWithSettings.length === 0) {
    return null;
  }

  return {
    tabs: nodeTypesWithSettings.map((nodeType) => nodeTypeToSettingTab(nodeType)),
    useStore: useNodeSettingsStoreAdapter,
  };
}

/**
 * Get all node types that have settings schemas defined.
 */
export function getNodeTypesWithSettings(): NodeTypeDefinition[] {
  return nodeTypeRegistry.getAll().filter((n) => n.settingsSchema);
}

/**
 * Get settings for a specific node type.
 * Returns merged defaults + user overrides.
 */
export function getNodeTypeSettings(nodeTypeId: string): Record<string, unknown> {
  return useNodeSettingsStore.getState().getSettings(nodeTypeId);
}
