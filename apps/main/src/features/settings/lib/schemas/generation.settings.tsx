/**
 * Generation Settings Schema
 *
 * Configure retry behavior and defaults for generation tools.
 */

import { useGenerationSettingsStore, useGenerationHistoryStore, type HistoryMode } from '@features/generation';

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';

const generationGroups: SettingGroup[] = [
  {
    id: 'viewer',
    title: 'Asset Viewer',
    description: 'Control behavior when viewing assets.',
    fields: [
      {
        id: 'autoSwitchOperationType',
        type: 'toggle',
        label: 'Auto-switch operation type',
        description: 'Automatically switch to "Extend" for videos and "Image to Video" for images when viewing an asset.',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'history',
    title: 'Asset History',
    description: 'Configure how asset usage history is tracked for quick reuse.',
    fields: [
      {
        id: 'historyMode',
        type: 'select',
        label: 'History Mode',
        description: 'How to organize asset history.',
        defaultValue: 'per-operation',
        options: [
          { value: 'per-operation', label: 'Per Operation', description: 'Separate history for each operation type (I2V, Extend, etc.)' },
          { value: 'global', label: 'Global', description: 'Single shared history across all operation types' },
        ],
      },
      {
        id: 'maxHistorySize',
        type: 'number',
        label: 'Max History Size',
        description: 'Maximum number of recent (non-pinned) assets to keep in history.',
        min: 5,
        max: 100,
        step: 5,
        defaultValue: 20,
      },
    ],
  },
  {
    id: 'retries',
    title: 'Auto-Retry',
    description: 'Control how failed generations are retried.',
    fields: [
      {
        id: 'autoRetryEnabled',
        type: 'toggle',
        label: 'Enable Auto-Retry',
        description: 'Automatically retry failed generations when errors look temporary or content-related.',
        defaultValue: true,
      },
      {
        id: 'autoRetryMaxAttempts',
        type: 'number',
        label: 'Max Retry Attempts',
        description: 'Maximum number of attempts per generation (including the first).',
        min: 1,
        max: 50,
        step: 1,
        defaultValue: 20,
      },
    ],
  },
];

function useGenerationSettingsStoreAdapter(): SettingStoreAdapter {
  const params = useGenerationSettingsStore((s) => s.params);
  const setParam = useGenerationSettingsStore((s) => s.setParam);

  // History store
  const historyMode = useGenerationHistoryStore((s) => s.historyMode);
  const maxHistorySize = useGenerationHistoryStore((s) => s.maxHistorySize);
  const setHistoryMode = useGenerationHistoryStore((s) => s.setHistoryMode);
  const setMaxHistorySize = useGenerationHistoryStore((s) => s.setMaxHistorySize);

  return {
    get: (fieldId: string) => {
      switch (fieldId) {
        case 'autoSwitchOperationType':
          return params.autoSwitchOperationType ?? true;
        case 'autoRetryEnabled':
          return params.autoRetryEnabled ?? true;
        case 'autoRetryMaxAttempts':
          return params.autoRetryMaxAttempts ?? 20;
        case 'historyMode':
          return historyMode ?? 'per-operation';
        case 'maxHistorySize':
          return maxHistorySize ?? 20;
        default:
          return undefined;
      }
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'autoSwitchOperationType') {
        setParam('autoSwitchOperationType', Boolean(value));
      }
      if (fieldId === 'autoRetryEnabled') {
        setParam('autoRetryEnabled', Boolean(value));
      }
      if (fieldId === 'autoRetryMaxAttempts') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setParam('autoRetryMaxAttempts', n);
        }
      }
      if (fieldId === 'historyMode') {
        setHistoryMode(value as HistoryMode);
      }
      if (fieldId === 'maxHistorySize') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setMaxHistorySize(n);
        }
      }
    },
    getAll: () => ({
      autoSwitchOperationType: params.autoSwitchOperationType ?? true,
      autoRetryEnabled: params.autoRetryEnabled ?? true,
      autoRetryMaxAttempts: params.autoRetryMaxAttempts ?? 20,
      historyMode: historyMode ?? 'per-operation',
      maxHistorySize: maxHistorySize ?? 20,
    }),
  };
}

export function registerGenerationSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'generation',
    category: {
      label: 'Generation',
      icon: 'dY>',
      order: 30,
    },
    groups: generationGroups,
    useStore: useGenerationSettingsStoreAdapter,
  });
}

