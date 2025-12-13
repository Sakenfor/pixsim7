/**
 * Generation Settings Schema
 *
 * Configure retry behavior and defaults for generation tools.
 */

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '@features/settings';
import { useGenerationSettingsStore } from '@features/generation';

const generationGroups: SettingGroup[] = [
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

  return {
    get: (fieldId: string) => {
      switch (fieldId) {
        case 'autoRetryEnabled':
          return params.autoRetryEnabled ?? true;
        case 'autoRetryMaxAttempts':
          return params.autoRetryMaxAttempts ?? 20;
        default:
          return undefined;
      }
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'autoRetryEnabled') {
        setParam('autoRetryEnabled', Boolean(value));
      }
      if (fieldId === 'autoRetryMaxAttempts') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setParam('autoRetryMaxAttempts', n);
        }
      }
    },
    getAll: () => ({
      autoRetryEnabled: params.autoRetryEnabled ?? true,
      autoRetryMaxAttempts: params.autoRetryMaxAttempts ?? 20,
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

