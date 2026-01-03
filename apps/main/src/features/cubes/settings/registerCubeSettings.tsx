/**
 * Cubes Settings Registration
 *
 * Registers cube settings schema + settings panel entry.
 */

import {
  DynamicSettingsPanel,
  settingsRegistry,
  settingsSchemaRegistry,
  type SettingStoreAdapter,
  type SettingTab,
} from '@features/settings';
import { useCubeSettingsStore } from '../stores/cubeSettingsStore';
import type { FormationPattern } from '@pixsim7/pixcubes';

const cubesTab: SettingTab = {
  id: 'cubes',
  label: 'Cubes',
  groups: [
    {
      id: 'cubes-visibility',
      title: 'Visibility',
      description: 'Toggle the cube overlay on or off.',
      fields: [
        {
          id: 'visible',
          type: 'toggle',
          label: 'Show Cube Overlay',
          defaultValue: true,
        },
      ],
    },
    {
      id: 'cubes-formation',
      title: 'Formation',
      description: 'Default cube layout pattern.',
      fields: [
        {
          id: 'formation',
          type: 'select',
          label: 'Formation Pattern',
          options: [
            { value: 'dock', label: 'Dock' },
            { value: 'arc', label: 'Arc' },
            { value: 'circle', label: 'Circle' },
            { value: 'grid', label: 'Grid' },
            { value: 'constellation', label: 'Constellation' },
            { value: 'scattered', label: 'Scattered' },
          ],
          defaultValue: 'arc',
        },
      ],
    },
  ],
};

function useCubeSettingsAdapter(): SettingStoreAdapter {
  const visible = useCubeSettingsStore((s) => s.visible);
  const formation = useCubeSettingsStore((s) => s.formation);
  const setVisible = useCubeSettingsStore((s) => s.setVisible);
  const setFormation = useCubeSettingsStore((s) => s.setFormation);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'visible') return visible;
      if (fieldId === 'formation') return formation;
      return undefined;
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'visible') {
        setVisible(Boolean(value));
      }
      if (fieldId === 'formation') {
        setFormation(value as FormationPattern);
      }
    },
    getAll: () => ({
      visible,
      formation,
    }),
  };
}

export function registerCubeSettings(): () => void {
  const unregisterSchema = settingsSchemaRegistry.register({
    categoryId: 'cubes',
    category: {
      label: 'Cubes',
      order: 40,
    },
    tab: cubesTab,
    useStore: useCubeSettingsAdapter,
  });

  const moduleId = 'cubes';

  settingsRegistry.register({
    id: moduleId,
    label: 'Cubes',
    order: 40,
    component: function CubesSettingsPanel() {
      return <DynamicSettingsPanel categoryId="cubes" />;
    },
  });

  return () => {
    unregisterSchema();
    settingsRegistry.unregister(moduleId);
  };
}
