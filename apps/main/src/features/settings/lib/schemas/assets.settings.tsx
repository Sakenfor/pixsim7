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
  {
    id: 'deletion',
    title: 'Deletion',
    description: 'Configure asset deletion behavior.',
    fields: [
      {
        id: 'deleteFromProvider',
        type: 'toggle',
        label: 'Delete from Provider',
        description: 'Also delete assets from the provider (e.g., Pixverse) when deleting them locally.',
        defaultValue: true,
      },
    ],
  },
];

function useAssetSettingsStoreAdapter(): SettingStoreAdapter {
  const downloadOnGenerate = useAssetSettingsStore((s) => s.downloadOnGenerate);
  const setDownloadOnGenerate = useAssetSettingsStore((s) => s.setDownloadOnGenerate);
  const deleteFromProvider = useAssetSettingsStore((s) => s.deleteFromProvider);
  const setDeleteFromProvider = useAssetSettingsStore((s) => s.setDeleteFromProvider);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'downloadOnGenerate') return downloadOnGenerate;
      if (fieldId === 'deleteFromProvider') return deleteFromProvider;
      return undefined;
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'downloadOnGenerate') setDownloadOnGenerate(value);
      if (fieldId === 'deleteFromProvider') setDeleteFromProvider(value);
    },
    getAll: () => ({ downloadOnGenerate, deleteFromProvider }),
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
