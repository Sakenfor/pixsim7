import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';
import { useAssetSettingsStore } from '@/stores/assetSettingsStore';

const assetGroups: SettingGroup[] = [
  {
    id: 'downloads',
    title: 'Downloads',
    description: 'Configure how assets are downloaded.',
    fields: [
      {
        id: 'downloadOnGenerate',
        type: 'toggle',
        label: 'Download on Generate',
        description: 'Automatically download assets when generation completes.',
        defaultValue: false,
      },
    ],
  },
];

function useAssetSettingsStoreAdapter(): SettingStoreAdapter {
  const downloadOnGenerate = useAssetSettingsStore((s) => s.downloadOnGenerate);
  const setDownloadOnGenerate = useAssetSettingsStore((s) => s.setDownloadOnGenerate);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'downloadOnGenerate') return downloadOnGenerate;
      return undefined;
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'downloadOnGenerate') setDownloadOnGenerate(value);
    },
    getAll: () => ({ downloadOnGenerate }),
  };
}

export function registerAssetSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'assets',
    category: {
      label: 'Assets',
      icon: '📦',
      order: 35,
    },
    groups: assetGroups,
    useStore: useAssetSettingsStoreAdapter,
  });
}
